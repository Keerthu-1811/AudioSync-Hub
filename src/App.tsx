import { useState, useEffect } from 'react';
import { Volume2, Power, RefreshCw, Sliders } from 'lucide-react';

interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault?: boolean;
}

interface SelectedDevice extends AudioDevice {
  delayMs: number;
  volume: number;
  muted: boolean;
}

function App() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<SelectedDevice[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);

  useEffect(() => {
    // Listen for messages from Python engine
    // @ts-ignore
    window.electronAPI.onEngineMessage((msg: any) => {
      if (msg.type === 'ready') {
        setIsEngineReady(true);
        // @ts-ignore
        window.electronAPI.sendCommand({ command: 'get_devices' });
      } else if (msg.type === 'devices_list') {
        setIsEngineReady(true); // If we get a response, the engine is definitely ready!
        setDevices(msg.devices);
      }
    });

    // Ask for devices initially just in case engine is already ready
    // @ts-ignore
    window.electronAPI.sendCommand({ command: 'get_devices' });
  }, []);

  const fetchDevices = () => {
    // @ts-ignore
    window.electronAPI.sendCommand({ command: 'get_devices' });
  };

  const pushRoutingToEngine = (newDevices: SelectedDevice[], active: boolean) => {
    const payload = active ? newDevices : [];
    // @ts-ignore
    window.electronAPI.sendCommand({
      command: 'set_routing',
      devices: payload
    });
  };

  const toggleDevice = (device: AudioDevice) => {
    const isSelected = selectedDevices.find(d => d.deviceId === device.deviceId);
    let newDevices;
    if (isSelected) {
      newDevices = selectedDevices.filter(d => d.deviceId !== device.deviceId);
    } else {
      newDevices = [...selectedDevices, { ...device, delayMs: 0, volume: 100, muted: false }];
    }
    setSelectedDevices(newDevices);
    pushRoutingToEngine(newDevices, isCapturing);
  };

  const toggleCapture = () => {
    const nextState = !isCapturing;
    setIsCapturing(nextState);
    pushRoutingToEngine(selectedDevices, nextState);
  };

  const updateDeviceParam = (deviceId: string, param: 'delayMs' | 'volume', value: number) => {
    const newDevices = selectedDevices.map(dev => {
      if (dev.deviceId === deviceId) {
        return { ...dev, [param]: value };
      }
      return dev;
    });
    setSelectedDevices(newDevices);
    pushRoutingToEngine(newDevices, isCapturing);
  };

  const toggleMute = (deviceId: string) => {
    const newDevices = selectedDevices.map(dev => {
      if (dev.deviceId === deviceId) {
        return { ...dev, muted: !dev.muted };
      }
      return dev;
    });
    setSelectedDevices(newDevices);
    pushRoutingToEngine(newDevices, isCapturing);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 flex flex-col gap-8 relative overflow-hidden">
      {/* Background glowing orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-5xl mx-auto w-full flex flex-col gap-8 z-10 flex-1">
        <header className="flex items-center justify-between bg-slate-900/50 backdrop-blur-xl border border-white/5 p-6 rounded-3xl shadow-2xl">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-4">
              AudioSync Hub
              <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium ${isEngineReady ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {isEngineReady && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
                {!isEngineReady && <div className="w-2 h-2 rounded-full bg-red-500"></div>}
                {isEngineReady ? 'Engine Ready' : 'Disconnected'}
              </div>
            </h1>
            <p className="text-slate-400 text-sm mt-2 font-medium">Native Multi-device Audio Router & Synchronizer</p>
          </div>
          <button 
            onClick={toggleCapture}
            disabled={!isEngineReady}
            className={`group relative flex items-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all duration-300 overflow-hidden ${
              !isEngineReady ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500' :
              isCapturing 
                ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 shadow-[0_0_30px_-5px_rgba(244,63,94,0.3)]' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] border border-white/10 hover:scale-105'
            }`}
          >
            {isCapturing && (
              <span className="absolute inset-0 w-full h-full bg-rose-500/20 animate-pulse"></span>
            )}
            <Power size={22} className={`relative z-10 transition-transform ${isCapturing ? 'animate-pulse text-rose-400' : 'group-hover:scale-110'}`} />
            <span className="relative z-10 tracking-wide">{isCapturing ? 'STOP ENGINE' : 'START ENGINE'}</span>
          </button>
        </header>

        {isCapturing && (
          <div className="bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 text-emerald-300 p-5 rounded-2xl text-sm flex items-start gap-4 shadow-xl">
            <div className="p-2 bg-emerald-500/20 rounded-full mt-0.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
            </div>
            <div>
              <strong className="block text-emerald-200 mb-1 text-base">Live Audio Routing Active</strong> 
              <span className="opacity-90 leading-relaxed">
                The native Python engine is currently hooking into your WASAPI loopback stream and routing low-latency audio directly to your active devices below.
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-[400px]">
          
          {/* Available Devices Panel */}
          <div className="lg:col-span-5 bg-slate-900/40 backdrop-blur-xl rounded-3xl p-6 border border-white/5 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <h2 className="text-xl font-bold flex items-center gap-3 text-slate-200">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <Volume2 className="text-blue-400" size={20} />
                </div>
                Hardware Outputs
              </h2>
              <button onClick={fetchDevices} className="p-2.5 hover:bg-white/5 rounded-xl transition-colors group" title="Refresh Devices">
                <RefreshCw size={18} className="text-slate-400 group-hover:text-blue-400 group-hover:rotate-180 transition-all duration-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {devices.map(device => {
                const isSelected = selectedDevices.some(d => d.deviceId === device.deviceId);
                return (
                  <div 
                    key={device.deviceId}
                    onClick={() => toggleDevice(device)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border group ${
                      isSelected 
                        ? 'bg-blue-500/15 border-blue-500/30 shadow-[0_0_20px_-5px_rgba(59,130,246,0.15)]' 
                        : 'bg-slate-800/30 border-transparent hover:bg-slate-800/60 hover:border-white/10'
                    }`}
                  >
                    <p className={`font-semibold flex justify-between items-center ${isSelected ? 'text-blue-300' : 'text-slate-300 group-hover:text-white'}`}>
                      <span className="truncate pr-3">{device.label || 'Unknown Device'}</span>
                      {device.isDefault && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-700/50 text-slate-400 px-2 py-1 rounded-md shrink-0">Default</span>
                      )}
                    </p>
                  </div>
                );
              })}
              {devices.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 pb-8">
                  <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                    <Volume2 size={24} className="opacity-50" />
                  </div>
                  <p className="font-medium">No output devices found.</p>
                  <p className="text-xs opacity-60 mt-1">Check your Windows sound settings.</p>
                </div>
              )}
            </div>
          </div>

          {/* Selected Devices Routing */}
          <div className="lg:col-span-7 bg-slate-900/40 backdrop-blur-xl rounded-3xl p-6 border border-white/5 flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
              <div className="p-2 bg-purple-500/20 rounded-xl">
                <Sliders className="text-purple-400" size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-200">
                Active Routing & Sync
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
              {selectedDevices.map(device => (
                <div key={device.deviceId} className="bg-slate-800/40 rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold text-base text-white truncate pr-4">{device.label}</h3>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-md font-medium border ${isCapturing ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                        {isCapturing ? 'Live Streaming' : 'Standby'}
                      </span>
                      <button 
                        onClick={() => toggleDevice(device)} 
                        className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded-lg transition-all"
                        title="Remove device"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Delay Slider */}
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                      <div className="flex justify-between text-xs font-semibold text-slate-400 mb-3 tracking-wide uppercase">
                        <span>Latency Offset</span>
                        <span className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">{device.delayMs} ms</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="1000" step="10"
                        value={device.delayMs}
                        onChange={(e) => updateDeviceParam(device.deviceId, 'delayMs', parseInt(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                      />
                    </div>

                    {/* Volume Slider */}
                    <div className="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-white/5">
                      <button onClick={() => toggleMute(device.deviceId)} className="text-slate-400 hover:text-white transition-colors group p-1">
                        <Volume2 size={20} className={`${device.muted ? 'text-rose-400 opacity-80' : 'group-hover:text-blue-400'} transition-colors`} />
                      </button>
                      <input 
                        type="range" 
                        min="0" max="200" step="1"
                        value={device.muted ? 0 : device.volume}
                        onChange={(e) => updateDeviceParam(device.deviceId, 'volume', parseInt(e.target.value))}
                        className="flex-1 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                      />
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded w-14 text-center ${
                        device.volume > 100
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-blue-400 bg-blue-500/10'
                      }`}>
                        {device.volume}%{device.volume > 100 ? ' ↑' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              
              {selectedDevices.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16">
                  <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 border border-white/5">
                    <Sliders size={32} className="opacity-40" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-300 mb-2">No Devices Selected</h3>
                  <p className="text-sm opacity-60 text-center max-w-[250px] leading-relaxed">
                    Click on devices in the left panel to add them to your routing configuration.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
