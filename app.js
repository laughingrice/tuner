const { useState, useEffect, useRef, useCallback } = React;

// --- CONSTANTS & DATA ---

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const DEFAULT_INSTRUMENTS = [
    {
        id: 'guitar-std',
        name: 'Guitar (Standard)',
        isDefault: true,
        strings: [
            { note: 'E', octave: 2 },
            { note: 'A', octave: 2 },
            { note: 'D', octave: 3 },
            { note: 'G', octave: 3 },
            { note: 'B', octave: 3 },
            { note: 'E', octave: 4 }
        ]
    },
    {
        id: 'bass-std',
        name: 'Bass (Standard)',
        isDefault: true,
        strings: [
            { note: 'E', octave: 1 },
            { note: 'A', octave: 1 },
            { note: 'D', octave: 2 },
            { note: 'G', octave: 2 }
        ]
    },
    {
        id: 'bass-5',
        name: 'Bass (5-String)',
        isDefault: true,
        strings: [
            { note: 'B', octave: 0 },
            { note: 'E', octave: 1 },
            { note: 'A', octave: 1 },
            { note: 'D', octave: 2 },
            { note: 'G', octave: 2 }
        ]
    },
    {
        id: 'violin',
        name: 'Violin',
        isDefault: true,
        strings: [
            { note: 'G', octave: 3 },
            { note: 'D', octave: 4 },
            { note: 'A', octave: 4 },
            { note: 'E', octave: 5 }
        ]
    }
];

// --- AUDIO LOGIC ---

const getNoteFrequency = (note, octave, refA4 = 440) => {
    const noteIndex = NOTE_NAMES.indexOf(note);
    const midiNum = (octave + 1) * 12 + noteIndex;
    return refA4 * Math.pow(2, (midiNum - 69) / 12);
};

const autoCorrelate = (buf, sampleRate) => {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }

    let d = 0; 
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    
    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
};

// --- VISUAL COMPONENTS ---

const StrobeBand = ({ speed, direction }) => {
    const duration = speed === 0 ? '0s' : `${Math.max(0.1, 1 / Math.abs(speed))}s`;
    const animationName = direction === 'sharp' ? 'strobe-spin-right' : 'strobe-spin-left';
    
    return (
        <div className="w-full flex-1 min-h-[1.5rem] bg-zinc-800 border-y border-zinc-700 overflow-hidden relative my-1 last:mb-0">
            <div className="absolute inset-0 strobe-pattern opacity-50" style={{ animation: speed === 0 ? 'none' : `${animationName} ${duration} linear infinite` }}></div>
            <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] z-10 -translate-x-1/2"></div>
        </div>
    );
};

const ChromaticNeedle = ({ cents }) => {
    const rotation = Math.max(-45, Math.min(45, cents));
    const isTuned = Math.abs(cents) < 3;
    const color = isTuned ? 'text-green-400' : 'text-red-400';
    
    return (
        <div className="relative w-full h-full max-h-[40vh] aspect-[2/1] flex justify-center items-end overflow-hidden">
            <div className="absolute bottom-0 w-full h-full border-t-2 border-zinc-600 rounded-t-full opacity-30"></div>
            <div className="absolute bottom-0 w-1 h-[15%] bg-zinc-500"></div>
            <div className="absolute bottom-0 w-1 h-[10%] bg-zinc-600 rotate-45 origin-bottom translate-x-[4rem] -translate-y-2"></div>
            <div className="absolute bottom-0 w-1 h-[10%] bg-zinc-600 -rotate-45 origin-bottom -translate-x-[4rem] -translate-y-2"></div>

            <div 
                className={`w-[1%] h-[85%] origin-bottom bg-current transition-transform duration-100 ease-linear shadow-[0_0_15px_currentColor] ${color}`}
                style={{ transform: `rotate(${rotation}deg)` }}
            ></div>
            <div className="absolute bottom-[-5%] w-[5%] aspect-square bg-zinc-200 rounded-full z-10"></div>
        </div>
    );
};

const PolyphonicDisplay = ({ detectedFreq, refFreq, strings }) => {
    return (
        <div className="flex justify-between items-end w-full h-full px-2 gap-1 md:gap-2">
            {strings.map((str, idx) => {
                const targetFreq = getNoteFrequency(str.note, str.octave, refFreq);
                const isActive = detectedFreq && Math.abs(detectedFreq - targetFreq) < 20; 
                let cents = 0;
                let isTuned = false;

                if (isActive) {
                    const semitones = 12 * (Math.log2(detectedFreq / targetFreq));
                    cents = semitones * 100;
                    isTuned = Math.abs(cents) < 5;
                }

                const transY = isActive ? Math.max(-45, Math.min(45, cents)) * -1 : 0;
                
                return (
                    <div key={idx} className={`flex flex-col items-center gap-1 w-full h-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                        <div className="flex-1 w-full bg-zinc-800 rounded-full relative flex items-center justify-center overflow-hidden">
                             <div 
                                className={`w-3 rounded-full transition-all duration-100 ${isTuned ? 'bg-green-500 h-3 w-full shadow-[0_0_10px_#22c55e]' : 'bg-red-500 h-1'}`}
                                style={{ transform: `translateY(${transY}px)` }}
                             ></div>
                             <div className="absolute w-full h-[1px] bg-white opacity-20"></div>
                        </div>
                        <span className="text-zinc-400 font-bold text-xs">{str.note}</span>
                    </div>
                );
            })}
        </div>
    );
};

// --- MODAL COMPONENT (Add/Edit) ---

const InstrumentModal = ({ isOpen, onClose, onSave, onDelete, initialData }) => {
    if (!isOpen) return null;

    const [name, setName] = useState(initialData ? initialData.name : "My Instrument");
    const [strings, setStrings] = useState(initialData ? initialData.strings : [{ note: 'E', octave: 2 }]);

    useEffect(() => {
        if(isOpen) {
            setName(initialData ? initialData.name : "My Instrument");
            setStrings(initialData ? initialData.strings : [{ note: 'E', octave: 2 }, { note: 'A', octave: 2 }, { note: 'D', octave: 3 }, { note: 'G', octave: 3 }]);
        }
    }, [isOpen, initialData]);

    const handleStringCountChange = (count) => {
        const newStrings = [...strings];
        if (count > newStrings.length) {
            while(newStrings.length < count) newStrings.push({ note: 'A', octave: 2 });
        } else {
            newStrings.length = count;
        }
        setStrings(newStrings);
    };

    const updateString = (idx, field, value) => {
        const newStrings = [...strings];
        newStrings[idx] = { ...newStrings[idx], [field]: value };
        setStrings(newStrings);
    };

    const handleSave = () => {
        onSave({ 
            id: initialData ? initialData.id : Date.now().toString(), 
            name, 
            strings, 
            isDefault: false 
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-zinc-900 w-full max-w-md rounded-2xl border border-zinc-700 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                    <h2 className="text-white font-bold text-lg">{initialData ? 'Edit Instrument' : 'Add Custom Instrument'}</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
                </div>
                
                <div className="p-4 overflow-y-auto flex-1 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Name</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Number of Strings</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="12" 
                            value={strings.length} 
                            onChange={(e) => handleStringCountChange(parseInt(e.target.value) || 1)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase">String Tuning</label>
                        {strings.map((str, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                                <span className="text-zinc-500 w-6 text-sm">#{idx + 1}</span>
                                <select 
                                    value={str.note}
                                    onChange={(e) => updateString(idx, 'note', e.target.value)}
                                    className="flex-1 bg-zinc-800 rounded p-2 text-white border border-transparent focus:border-blue-500 outline-none"
                                >
                                    {NOTE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    min="0" max="8" 
                                    value={str.octave} 
                                    onChange={(e) => updateString(idx, 'octave', parseInt(e.target.value))}
                                    className="w-16 bg-zinc-800 rounded p-2 text-white border border-transparent focus:border-blue-500 outline-none text-center"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-zinc-800 flex gap-2">
                    {initialData && !initialData.isDefault && (
                        <button 
                            onClick={() => { onDelete(initialData.id); onClose(); }}
                            className="px-4 py-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 mr-auto"
                        >
                            Delete
                        </button>
                    )}
                    <button onClick={onClose} className="px-4 py-2 text-zinc-400 hover:text-white">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-500">Save</button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---

const TunerApp = () => {
    // --- STATE ---
    const [instruments, setInstruments] = useState(() => {
        const saved = localStorage.getItem('tuner_instruments');
        return saved ? JSON.parse(saved) : DEFAULT_INSTRUMENTS;
    });

    const [currentInstrumentId, setCurrentInstrumentId] = useState(() => {
        return localStorage.getItem('tuner_current_inst') || 'guitar-std';
    });

    const [mode, setMode] = useState(() => localStorage.getItem('tuner_mode') || 'chromatic');
    const [refFreq, setRefFreq] = useState(() => parseInt(localStorage.getItem('tuner_reffreq')) || 440);
    
    // UI State
    const [isListening, setIsListening] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingInstrument, setEditingInstrument] = useState(null); 
    const [tuningData, setTuningData] = useState({ note: '--', octave: '', cents: 0, frequency: 0 });

    // --- REFS ---
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micStreamRef = useRef(null);
    const requestRef = useRef(null);
    const wakeLockRef = useRef(null);
    const refFreqRef = useRef(refFreq);
    const isListeningRef = useRef(isListening);

    // Derived State
    const currentInstrument = instruments.find(i => i.id === currentInstrumentId) || instruments[0];

    // --- EFFECT: Sync Refs & Storage ---
    useEffect(() => {
        localStorage.setItem('tuner_instruments', JSON.stringify(instruments));
        localStorage.setItem('tuner_current_inst', currentInstrumentId);
        localStorage.setItem('tuner_mode', mode);
        localStorage.setItem('tuner_reffreq', refFreq);
        refFreqRef.current = refFreq;
    }, [instruments, currentInstrumentId, mode, refFreq]);

    // Keep track of listening state for wake lock handler
    useEffect(() => {
        isListeningRef.current = isListening;
    }, [isListening]);


    // --- WAKE LOCK LOGIC (Auto) ---
    const requestWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            } catch (err) { console.warn("Wake Lock Error:", err); }
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
        }
    }, []);

    // Re-acquire lock if tab visibility changes while listening
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && isListeningRef.current) {
                await requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [requestWakeLock]);

    // Main Wake Lock Switch based on listening state
    useEffect(() => {
        if (isListening) requestWakeLock();
        else releaseWakeLock();
        return () => releaseWakeLock();
    }, [isListening, requestWakeLock, releaseWakeLock]);


    // --- TUNER LOGIC ---
    const updatePitch = () => {
        if (!analyserRef.current) return;
        const buffer = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buffer);
        const frequency = autoCorrelate(buffer, audioContextRef.current.sampleRate);

        if (frequency !== -1) {
            const currentRefFreq = refFreqRef.current;
            const noteNum = 12 * (Math.log(frequency / currentRefFreq) / Math.log(2)) + 69;
            const noteIndex = Math.round(noteNum);
            const noteName = NOTE_NAMES[noteIndex % 12];
            const octave = Math.floor(noteIndex / 12) - 1;
            const perfectFreq = currentRefFreq * Math.pow(2, (noteIndex - 69) / 12);
            const cents = 1200 * Math.log2(frequency / perfectFreq);

            setTuningData({ note: noteName, octave: octave, cents: cents, frequency: frequency });
        }
        requestRef.current = requestAnimationFrame(updatePitch);
    };

    const startMic = async () => {
        if (audioContextRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 2048;
            const microphone = audioContextRef.current.createMediaStreamSource(stream);
            microphone.connect(analyserRef.current);
            micStreamRef.current = stream;
            setIsListening(true);
            requestRef.current = requestAnimationFrame(updatePitch);
        } catch (err) { console.error("Mic Error:", err); alert("Could not access microphone."); }
    };

    const stopMic = () => {
        if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(track => track.stop()); micStreamRef.current = null; }
        if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        setIsListening(false);
        setTuningData({ note: '--', octave: '', cents: 0, frequency: 0 });
    };

    const toggleMic = () => isListening ? stopMic() : startMic();

    // Instrument Handlers
    const handleSaveInstrument = (instData) => {
        if (instruments.some(i => i.id === instData.id)) {
            setInstruments(prev => prev.map(i => i.id === instData.id ? instData : i));
        } else {
            setInstruments(prev => [...prev, instData]);
            setCurrentInstrumentId(instData.id);
        }
    };

    const handleDeleteInstrument = (id) => {
        const newIdx = instruments.findIndex(i => i.id === id) - 1;
        const fallbackId = instruments[Math.max(0, newIdx)].id;
        setInstruments(prev => prev.filter(i => i.id !== id));
        setCurrentInstrumentId(fallbackId);
    };

    const openAddModal = () => { setEditingInstrument(null); setModalOpen(true); };
    const openEditModal = () => { if (currentInstrument.isDefault) return; setEditingInstrument(currentInstrument); setModalOpen(true); };

    const isSharp = tuningData.cents > 0;
    const strobeSpeed = (tuningData.cents / 50); 
    const stepButtonStyle = "flex-1 h-full min-h-[3rem] flex items-center justify-center bg-zinc-800 rounded-md text-zinc-400 hover:text-white active:scale-95 transition-all cursor-pointer select-none";

    // --- RENDER ---
    return (
        <div className="flex flex-col landscape:flex-row w-full h-[100dvh] bg-zinc-950 overflow-hidden relative">
            
            <InstrumentModal 
                isOpen={modalOpen} 
                onClose={() => setModalOpen(false)} 
                onSave={handleSaveInstrument}
                onDelete={handleDeleteInstrument}
                initialData={editingInstrument}
            />

            {/* LEFT PANEL */}
            <div className="flex-1 relative flex flex-col items-center justify-between bg-gradient-to-br from-black to-zinc-900 overflow-hidden p-4">
                <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
                    <div className="flex items-start font-black text-white tracking-tighter leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" style={{ fontSize: 'min(25vh, 25vw)' }}>
                        {tuningData.note}
                        <span className="text-[0.4em] mt-[0.1em] text-zinc-500 font-normal ml-2">{tuningData.octave}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center min-h-[4rem] mt-4">
                        {tuningData.note !== '--' ? (
                            <>
                                <div className={`text-3xl landscape:text-4xl font-mono font-bold ${Math.abs(tuningData.cents) < 3 ? 'text-green-500' : 'text-red-500'}`}>
                                    {tuningData.cents > 0 ? '+' : ''}{Math.floor(tuningData.cents)}<span className="text-lg ml-1 opacity-60">cents</span>
                                </div>
                                <div className="text-2xl landscape:text-3xl font-mono text-zinc-500 mt-1">
                                    {tuningData.frequency.toFixed(1)} <span className="text-sm opacity-60">Hz</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-zinc-600 font-mono animate-pulse">{isListening ? 'Listening...' : 'Mic Off'}</div>
                        )}
                    </div>
                </div>

                <div className="w-full h-[35%] flex flex-col items-center justify-center pb-2">
                    {mode === 'chromatic' && <ChromaticNeedle cents={tuningData.cents} />}
                    {mode === 'strobe' && (
                        <div className="w-full h-full flex flex-col justify-center opacity-90 gap-1">
                            <StrobeBand speed={strobeSpeed} direction={isSharp ? 'sharp' : 'flat'} />
                            <StrobeBand speed={strobeSpeed * 1.5} direction={isSharp ? 'sharp' : 'flat'} />
                            <StrobeBand speed={strobeSpeed * 0.75} direction={isSharp ? 'sharp' : 'flat'} />
                        </div>
                    )}
                    {mode === 'polyphonic' && (
                        <PolyphonicDisplay detectedFreq={tuningData.frequency} refFreq={refFreq} strings={currentInstrument.strings} />
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: Controls */}
            <div className="flex-none w-full landscape:w-80 bg-zinc-900 border-t landscape:border-t-0 landscape:border-l border-zinc-800 p-4 flex flex-col gap-3 shadow-xl z-20 overflow-y-auto">
                <div className="grid grid-cols-2 landscape:grid-cols-1 gap-3">
                    
                    {/* Instrument Selector */}
                    <div className="col-span-2 landscape:col-span-1 flex flex-col gap-1">
                        <label className="text-zinc-500 text-[10px] uppercase font-bold">Instrument</label>
                        <div className="flex gap-1">
                            <select 
                                value={currentInstrumentId}
                                onChange={(e) => {
                                    if(e.target.value === 'ADD_NEW') openAddModal();
                                    else setCurrentInstrumentId(e.target.value);
                                }}
                                className="flex-1 bg-zinc-950 border border-zinc-700 text-white text-sm rounded-lg p-3 outline-none focus:border-blue-500"
                            >
                                {instruments.map(inst => (
                                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                                ))}
                                <option disabled>──────────</option>
                                <option value="ADD_NEW">+ Add Custom...</option>
                            </select>
                            
                            {!currentInstrument.isDefault && (
                                <button 
                                    onClick={openEditModal}
                                    className="px-3 bg-zinc-800 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 border border-zinc-700"
                                >
                                    ✎
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mode */}
                    <div className="col-span-2 landscape:col-span-1 flex flex-col gap-1">
                        <label className="text-zinc-500 text-[10px] uppercase font-bold">Mode</label>
                        <div className="bg-zinc-950 p-1 rounded-lg border border-zinc-800 flex flex-row landscape:flex-col gap-1">
                            {['chromatic', 'polyphonic', 'strobe'].map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={`flex-1 landscape:flex-none text-center landscape:text-left px-2 py-2 landscape:py-3 rounded-md text-xs landscape:text-sm font-medium transition-all flex items-center justify-center landscape:justify-between ${
                                        mode === m 
                                        ? 'bg-zinc-800 text-white shadow-md border border-zinc-700' 
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    <span className="capitalize hidden landscape:inline">{m}</span>
                                    <span className="capitalize landscape:hidden">{m.slice(0,4)}</span>
                                    <div className={`hidden landscape:block w-2 h-2 rounded-full ${mode === m ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ref Pitch (Full width now that screen button is gone) */}
                    <div className="col-span-2 landscape:col-span-1 flex flex-col gap-1">
                        <label className="text-zinc-500 text-[10px] uppercase font-bold">Ref Pitch</label>
                        <div className="flex items-center justify-between bg-zinc-950 rounded-lg border border-zinc-800 p-1 h-12">
                            <button onClick={() => setRefFreq(r => r - 1)} className={stepButtonStyle}>-</button>
                            <input 
                                type="number" 
                                value={refFreq}
                                onChange={(e) => setRefFreq(parseInt(e.target.value) || 440)}
                                className="w-full bg-transparent text-center text-lg font-mono text-white focus:outline-none appearance-none border-none m-0 p-0"
                            />
                            <button onClick={() => setRefFreq(r => r + 1)} className={stepButtonStyle}>+</button>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-2 landscape:pt-4 border-t border-zinc-800">
                    <button 
                        onClick={toggleMic}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-md font-bold text-sm transition-all ${
                            isListening 
                            ? 'bg-red-900/30 text-red-200 border border-red-900 hover:bg-red-900/50' 
                            : 'bg-green-900/30 text-green-200 border border-green-900 hover:bg-green-900/50'
                        }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                        {isListening ? 'STOP' : 'START'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<TunerApp />);