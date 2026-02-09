const { useState, useEffect, useRef } = React;

// --- Visual Components ---

const StrobeBand = ({ speed, direction }) => {
    const duration = speed === 0 ? '0s' : `${1 / Math.abs(speed)}s`;
    const animationName = direction === 'sharp' ? 'strobe-spin-right' : 'strobe-spin-left';
    
    const style = {
        animation: speed === 0 ? 'none' : `${animationName} ${duration} linear infinite`,
    };

    return (
        <div className="w-full h-12 bg-zinc-800 border-y border-zinc-700 overflow-hidden relative mb-2">
            <div className="absolute inset-0 strobe-pattern opacity-50" style={style}></div>
            <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] z-10 -translate-x-1/2"></div>
        </div>
    );
};

const ChromaticNeedle = ({ cents }) => {
    const rotation = Math.max(-45, Math.min(45, cents));
    const color = Math.abs(cents) < 3 ? 'text-green-400' : 'text-red-400';
    
    return (
        <div className="relative w-64 h-32 flex justify-center items-end overflow-hidden mb-6">
            <div className="absolute bottom-0 w-full h-full border-t-2 border-zinc-600 rounded-t-full opacity-30"></div>
            <div className="absolute bottom-0 w-1 h-4 bg-zinc-500"></div>
            <div className="absolute bottom-0 w-1 h-3 bg-zinc-600 rotate-45 origin-bottom translate-x-16 -translate-y-2"></div>
            <div className="absolute bottom-0 w-1 h-3 bg-zinc-600 -rotate-45 origin-bottom -translate-x-16 -translate-y-2"></div>

            <div 
                className={`w-1 h-28 origin-bottom bg-current transition-transform duration-100 ease-linear shadow-[0_0_15px_currentColor] ${color}`}
                style={{ transform: `rotate(${rotation}deg)` }}
            ></div>
            
            <div className="absolute bottom-[-10px] w-4 h-4 bg-zinc-200 rounded-full z-10"></div>
        </div>
    );
};

const PolyphonicDisplay = ({ strings }) => {
    return (
        <div className="flex justify-between items-end w-full max-w-md h-32 px-4 gap-2">
            {strings.map((str, idx) => {
                const isTuned = Math.abs(str.cents) < 5;
                return (
                    <div key={idx} className="flex flex-col items-center gap-2 w-full">
                        <div className="h-full w-full bg-zinc-800 rounded-full relative flex items-center justify-center overflow-hidden">
                             <div 
                                className={`w-2 rounded-full transition-all duration-300 ${isTuned ? 'bg-green-500 h-2 w-full shadow-[0_0_10px_#22c55e]' : 'bg-red-500 h-1'}`}
                                style={{ transform: `translateY(${str.cents * -1}px)` }}
                             ></div>
                             <div className="absolute w-full h-[1px] bg-white opacity-20"></div>
                        </div>
                        <span className="text-zinc-400 font-bold text-sm">{str.note}</span>
                    </div>
                );
            })}
        </div>
    );
};

// --- Main Application ---

const TunerApp = () => {
    const [mode, setMode] = useState('chromatic');
    const [refFreq, setRefFreq] = useState(440);
    const [keepAwake, setKeepAwake] = useState(false);
    const wakeLockRef = useRef(null);

    // Simulation Data
    const [simulatedData, setSimulatedData] = useState({ note: 'A', octave: 4, cents: 0 });

    // Wake Lock Logic
    useEffect(() => {
        const toggleWakeLock = async () => {
            if (keepAwake) {
                try {
                    if ('wakeLock' in navigator) {
                        wakeLockRef.current = await navigator.wakeLock.request('screen');
                    }
                } catch (err) {
                    console.error(`${err.name}, ${err.message}`);
                    setKeepAwake(false);
                }
            } else {
                if (wakeLockRef.current) {
                    await wakeLockRef.current.release();
                    wakeLockRef.current = null;
                }
            }
        };
        toggleWakeLock();
        return () => {
            if (wakeLockRef.current) wakeLockRef.current.release();
        };
    }, [keepAwake]);

    // Simulation Loop
    useEffect(() => {
        const interval = setInterval(() => {
            setSimulatedData(prev => {
                let drift = prev.cents + (Math.random() * 4 - 2); 
                if (drift > 50) drift = -50;
                if (drift < -50) drift = 50;
                return { ...prev, cents: drift };
            });
        }, 50);
        return () => clearInterval(interval);
    }, []);

    const isSharp = simulatedData.cents > 0;
    const strobeSpeed = Math.abs(simulatedData.cents) / 50;

    // --- SHARED STYLES ---
    // Button style shared for both + and - to ensure exact match
    const stepButtonStyle = "w-12 h-12 flex items-center justify-center bg-zinc-900 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all border border-transparent hover:border-zinc-700 cursor-pointer select-none";

    return (
        <div className="flex flex-col md:flex-row w-full h-full max-w-5xl max-h-[600px] bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
            
            {/* LEFT: Display */}
            <div className="flex-grow relative flex flex-col items-center justify-center p-8 bg-gradient-to-br from-black to-zinc-900">
                <div className="flex flex-col items-center mb-8 z-10">
                    <div className="text-9xl font-black text-white tracking-tighter flex items-start drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                        {simulatedData.note}
                        <span className="text-4xl mt-2 text-zinc-500 font-normal">{simulatedData.octave}</span>
                    </div>
                    <div className={`text-xl font-mono mt-2 ${Math.abs(simulatedData.cents) < 3 ? 'text-green-500' : 'text-red-500'}`}>
                        {simulatedData.cents > 0 ? '+' : ''}{Math.floor(simulatedData.cents)} cents
                    </div>
                </div>

                <div className="w-full flex flex-col items-center justify-center h-48">
                    {mode === 'chromatic' && <ChromaticNeedle cents={simulatedData.cents} />}
                    {mode === 'strobe' && (
                        <div className="w-full max-w-lg">
                            <StrobeBand speed={strobeSpeed} direction={isSharp ? 'sharp' : 'flat'} />
                            <StrobeBand speed={strobeSpeed * 1.5} direction={isSharp ? 'sharp' : 'flat'} />
                            <StrobeBand speed={strobeSpeed * 0.75} direction={isSharp ? 'sharp' : 'flat'} />
                        </div>
                    )}
                    {mode === 'polyphonic' && (
                        <PolyphonicDisplay strings={[
                            { note: 'E', cents: -10 },
                            { note: 'A', cents: simulatedData.cents },
                            { note: 'D', cents: 5 },
                            { note: 'G', cents: -2 },
                            { note: 'B', cents: 15 },
                            { note: 'e', cents: 0 },
                        ]} />
                    )}
                </div>
            </div>

            {/* RIGHT: Controls */}
            <div className="w-full md:w-80 bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col gap-6 shadow-xl z-20 overflow-y-auto no-scrollbar">
                
                {/* Header */}
                <div className="border-b border-zinc-700 pb-2">
                    <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Tuning Master Pro</h2>
                </div>

                {/* 1. Mode Switch */}
                <div className="flex flex-col gap-2">
                    <label className="text-zinc-500 text-xs uppercase font-bold">Tuner Mode</label>
                    <div className="bg-zinc-950 p-1 rounded-lg border border-zinc-800 flex flex-col gap-1">
                        {['chromatic', 'polyphonic', 'strobe'].map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`text-left px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-between group ${
                                    mode === m 
                                    ? 'bg-zinc-800 text-white shadow-md border border-zinc-700' 
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                                }`}
                            >
                                <span className="capitalize">{m}</span>
                                <div className={`w-2 h-2 rounded-full ${mode === m ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6]' : 'bg-zinc-700'}`}></div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Reference Pitch (FIXED) */}
                <div className="flex flex-col gap-2">
                    <label className="text-zinc-500 text-xs uppercase font-bold">Reference Pitch (Hz)</label>
                    
                    {/* Container */}
                    <div className="flex items-center justify-between bg-zinc-950 rounded-lg border border-zinc-800 p-1">
                        
                        {/* Minus Button */}
                        <button 
                            onClick={() => setRefFreq(r => r - 1)}
                            className={stepButtonStyle}
                            aria-label="Decrease Pitch"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 12H6"></path></svg>
                        </button>

                        {/* Text Input (Spinners Removed via CSS) */}
                        <input 
                            type="number" 
                            value={refFreq}
                            onChange={(e) => setRefFreq(parseInt(e.target.value) || 440)}
                            className="w-24 bg-transparent text-center text-2xl font-mono text-white focus:outline-none appearance-none border-none m-0 p-0"
                        />

                        {/* Plus Button */}
                        <button 
                            onClick={() => setRefFreq(r => r + 1)}
                            className={stepButtonStyle}
                            aria-label="Increase Pitch"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                        </button>
                    </div>
                </div>

                {/* 3. Keep Screen On */}
                <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                    <label className="text-zinc-400 text-xs font-bold uppercase cursor-pointer" onClick={() => setKeepAwake(!keepAwake)}>
                        Keep Screen On
                    </label>
                    
                    <button 
                        onClick={() => setKeepAwake(!keepAwake)}
                        className={`w-12 h-6 rounded-full relative transition-colors duration-300 focus:outline-none ${keepAwake ? 'bg-blue-600' : 'bg-zinc-700'}`}
                    >
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-md ${keepAwake ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                </div>

                <div className="mt-auto pt-4 border-t border-zinc-800">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider">Mic Input Active</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<TunerApp />);