import sys
import json
import threading
import collections
import subprocess
import numpy as np
import pyaudiowpatch as pyaudio
import time


p = pyaudio.PyAudio()

wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
default_out_info = p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])

# State
active_devices = {} # dev_id -> { "queue": deque, "buffer": bytearray, "stream": PyAudio Stream, "volume": float, "delayMs": int, "channels": int, "rate": int }
state_lock = threading.Lock()
in_stream = None

def get_devices():
    """
    Enumerate output devices using PowerShell (always fresh, sees newly connected devices).
    Cross-reference GUIDs to PyAudio device indices for stream opening.
    """
    try:
        result = subprocess.run(
            ['powershell', '-NoProfile', '-Command',
             'Get-PnpDevice -Class AudioEndpoint | Where-Object { $_.Status -eq "OK" } | Select-Object FriendlyName,InstanceId | ConvertTo-Json'],
            capture_output=True, text=True, timeout=8
        )
        
        if result.returncode != 0 or not result.stdout.strip():
            return get_devices_pyaudio_fallback()
        
        ps_devices = json.loads(result.stdout)
        # PowerShell may return a single dict instead of a list for one device
        if isinstance(ps_devices, dict):
            ps_devices = [ps_devices]
        
        # Build GUID -> PyAudio index map from the current p instance
        # The PyAudioWPatch device name contains parts of the GUID-based endpoint path.
        # We match by extracting the GUID from the PowerShell InstanceId and checking
        # if the PyAudio device description contains that GUID (case-insensitive).
        guid_to_pa_index = {}
        for i in range(p.get_device_count()):
            dev = p.get_device_info_by_index(i)
            if dev["hostApi"] == wasapi_info["index"] and dev["maxOutputChannels"] > 0:
                guid_to_pa_index[i] = dev
        
        # Also build a name-based lookup for matching
        pa_name_to_index = {
            dev["name"]: idx
            for idx, dev in guid_to_pa_index.items()
        }
        
        devices = []
        output_guids = set()  # Avoid duplicates
        for ps_dev in ps_devices:
            name = ps_dev.get("FriendlyName", "")
            instance_id = ps_dev.get("InstanceId", "")
            
            # Only render (output) devices: InstanceId contains {0.0.0.x} for render
            # Input devices have {0.0.1.x}
            if "{0.0.1." in instance_id:
                continue
            
            # Extract GUID from InstanceId: "SWD\\MMDEVAPI\\{0.0.0.00000000}.{GUID}"
            guid = ""
            if "}." in instance_id:
                guid = instance_id.rsplit("}.{", 1)[-1].rstrip("}").upper()
            
            if guid in output_guids:
                continue
            output_guids.add(guid)
            
            # Match to a PyAudio index by name prefix (PyAudio truncates long names)
            matched_idx = None
            for pa_name, idx in pa_name_to_index.items():
                # Check if either name is a prefix of the other (PowerShell has full names)
                if pa_name.lower() in name.lower() or name.lower()[:len(pa_name)] == pa_name.lower():
                    matched_idx = idx
                    break
            
            if matched_idx is not None:
                dev_info = p.get_device_info_by_index(matched_idx)
                devices.append({
                    "deviceId": str(matched_idx),
                    "label": name,  # Use full Windows friendly name
                    "isDefault": matched_idx == default_out_info["index"],
                    "channels": min(dev_info["maxOutputChannels"], 2),
                    "rate": int(dev_info["defaultSampleRate"])
                })
        
        # If no matches found (e.g. newly connected device not in p's cache yet),
        # fall back to PyAudio but include what we have
        if not devices:
            return get_devices_pyaudio_fallback()
        
        return devices

    except Exception as e:
        sys.stderr.write(f"get_devices (powershell) error: {e}\n")
        return get_devices_pyaudio_fallback()


def get_devices_pyaudio_fallback():
    """Original PyAudio-based enumeration as fallback."""
    devices = []
    try:
        for i in range(p.get_device_count()):
            dev = p.get_device_info_by_index(i)
            if dev["hostApi"] == wasapi_info["index"] and not dev["isLoopbackDevice"] and dev["maxOutputChannels"] > 0:
                devices.append({
                    "deviceId": str(dev["index"]),
                    "label": dev["name"],
                    "isDefault": dev["index"] == default_out_info["index"],
                    "channels": min(dev["maxOutputChannels"], 2),
                    "rate": int(dev["defaultSampleRate"])
                })
        return devices
    except Exception as e:
        sys.stderr.write(f"get_devices fallback error: {e}\n")
        return []


def send_message(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

def in_callback(in_data, frame_count, time_info, status):
    # Convert bytes to numpy float32 for easy volume manipulation
    # We do this once here to save CPU
    audio_data = np.frombuffer(in_data, dtype=np.float32)
    
    with state_lock:
        for dev_id, state in active_devices.items():
            # Apply volume (supports >100% boost; clamp to prevent hard clipping distortion)
            vol = state["volume"] / 100.0
            if vol != 1.0:
                chunk = np.clip(audio_data * vol, -1.0, 1.0)
            else:
                chunk = audio_data

            q = state["queue"]
            q.append(chunk.tobytes())

    return (in_data, pyaudio.paContinue)

def create_out_callback(dev_id):
    def out_callback(in_data, frame_count, time_info, status):
        state = active_devices.get(dev_id)
        if not state:
            return (b'\x00' * frame_count * 2 * 4, pyaudio.paContinue)

        frame_size = state["channels"] * 4
        needed_bytes = frame_count * frame_size
        target_delay_bytes = int(state["rate"] * (state["delayMs"] / 1000.0)) * frame_size
        
        # Drain queue into linear bytearray buffer
        while len(state["queue"]) > 0:
            state["buffer"] += state["queue"].popleft()
            
        ideal_buffer_size = target_delay_bytes + needed_bytes * 2
        
        if len(state["buffer"]) < target_delay_bytes + needed_bytes:
            # Not enough data for the requested delay. Play silence.
            return (b'\x00' * needed_bytes, pyaudio.paContinue)
            
        # If the user drastically reduces the delay slider, truncate the buffer to catch up instantly
        if len(state["buffer"]) > ideal_buffer_size + needed_bytes * 5:
            excess = len(state["buffer"]) - ideal_buffer_size
            excess = (excess // frame_size) * frame_size
            state["buffer"] = state["buffer"][excess:]

        # Micro-drift correction (skip or duplicate 1 frame per chunk) to keep latency locked without popping
        if len(state["buffer"]) > ideal_buffer_size + frame_size * 5:
            # Consume 1 extra frame to speed up
            chunk_to_play = state["buffer"][:needed_bytes]
            state["buffer"] = state["buffer"][needed_bytes + frame_size:]
        elif len(state["buffer"]) < ideal_buffer_size - frame_size * 5:
            # Duplicate the last frame, consume 1 less frame to slow down
            chunk_to_play = state["buffer"][:needed_bytes - frame_size] + state["buffer"][needed_bytes - frame_size * 2 : needed_bytes - frame_size]
            state["buffer"] = state["buffer"][needed_bytes - frame_size:]
        else:
            # Perfect sync
            chunk_to_play = state["buffer"][:needed_bytes]
            state["buffer"] = state["buffer"][needed_bytes:]

        return (bytes(chunk_to_play), pyaudio.paContinue)
    return out_callback

def start_capture():
    global in_stream
    if in_stream:
        return

    # Find loopback for default device
    loopback = None
    for i in range(p.get_device_count()):
        dev = p.get_device_info_by_index(i)
        if dev["hostApi"] == wasapi_info["index"] and dev["isLoopbackDevice"]:
            if default_out_info["name"] in dev["name"]:
                loopback = dev
                break
                
    if not loopback:
        sys.stderr.write("Could not find loopback device\n")
        return

    in_stream = p.open(format=pyaudio.paFloat32,
                       channels=loopback["maxInputChannels"],
                       rate=int(loopback["defaultSampleRate"]),
                       input=True,
                       input_device_index=loopback["index"],
                       frames_per_buffer=480, # 10ms at 48khz
                       stream_callback=in_callback)
    in_stream.start_stream()

def handle_routing(configs):
    global active_devices
    with state_lock:
        current_ids = set(active_devices.keys())
        new_ids = set(c["deviceId"] for c in configs)
        
        # Stop removed
        for dev_id in current_ids - new_ids:
            state = active_devices[dev_id]
            state["stream"].stop_stream()
            state["stream"].close()
            del active_devices[dev_id]
            
        # Add new or update
        for c in configs:
            dev_id = c["deviceId"]
            if dev_id not in active_devices:
                # Need to look up device info for channels/rate
                try:
                    dev_info = p.get_device_info_by_index(int(dev_id))
                    rate = int(dev_info["defaultSampleRate"])
                    channels = dev_info["maxOutputChannels"]
                    if channels > 2: channels = 2 # Max stereo loopback usually
                    
                    delay_frames = int(rate * (c.get("delayMs", 0) / 1000.0))
                    
                    stream = p.open(format=pyaudio.paFloat32,
                                    channels=channels,
                                    rate=rate,
                                    output=True,
                                    output_device_index=int(dev_id),
                                    frames_per_buffer=480,
                                    stream_callback=create_out_callback(dev_id))
                                    
                    active_devices[dev_id] = {
                        "queue": collections.deque(),
                        "buffer": bytearray(),
                        "stream": stream,
                        "volume": c.get("volume", 100),
                        "delayMs": c.get("delayMs", 0),
                        "channels": channels,
                        "rate": rate
                    }
                    stream.start_stream()
                except Exception as e:
                    sys.stderr.write(f"Failed to open stream for {dev_id}: {e}\n")
            else:
                state = active_devices[dev_id]
                state["volume"] = c.get("volume", 100)
                state["delayMs"] = c.get("delayMs", 0)

def main():
    start_capture()
    send_message({"type": "ready"})
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            cmd = msg.get("command")
            
            if cmd == "get_devices":
                devs = get_devices()
                send_message({"type": "devices_list", "devices": devs})
            elif cmd == "set_routing":
                handle_routing(msg.get("devices", []))
                send_message({"type": "routing_updated"})
        except Exception as e:
            sys.stderr.write(f"Error: {e}\n")

if __name__ == "__main__":
    main()
