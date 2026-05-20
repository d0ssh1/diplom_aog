// ==========================================
// ЭКРАН: Сшивание планов - ШАГ 2 (Редактор) - ТЕМНЫЙ СТИЛЬ
// ==========================================
const StitchingEditorView = ({ navigate }) => {
    const [activeTool, setActiveTool] = useState('move');
    const [activeLayer, setActiveLayer] = useState('p1');

    return (
        <div className="h-screen flex flex-col bg-[#0A0A0A] text-white font-sans overflow-hidden selection:bg-[#FF4500] selection:text-white">
             
             {/* --- HEADER (ШАПКА) --- */}
             <div className="h-14 bg-[#0A0A0A] flex items-center justify-between px-6 border-b border-zinc-800 shrink-0 z-30">
                <div className="w-10"></div> {/* Spacer */}
                
                {/* Степпер (как на скриншоте - маленькие точки) */}
                <div className="flex space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF4500]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF4500]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-700"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-700"></div>
                </div>

                <button onClick={() => navigate('stitching_select')} className="text-gray-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                
                {/* --- ЛЕВАЯ ЧАСТЬ: ХОЛСТ САПР --- */}
                <div className="flex-1 relative bg-[#1A1A1A] flex items-center justify-center overflow-hidden">
                    
                    {/* Сетка на фоне холста (светлая на темном) */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
                    
                    {/* Кнопки истории (Undo/Redo) - адаптированы под темный стиль */}
                    <div className="absolute top-6 left-6 flex space-x-3 z-10">
                        <button className="w-10 h-10 bg-[#222] border border-zinc-700 flex items-center justify-center hover:bg-[#333] hover:text-white transition-colors text-gray-400">
                            <Undo2 size={18} />
                        </button>
                        <button className="w-10 h-10 bg-[#222] border border-zinc-700 flex items-center justify-center hover:bg-[#333] hover:text-white transition-colors text-gray-400">
                            <Redo2 size={18} />
                        </button>
                    </div>

                    {/* Подсказка управления */}
                    <div className="absolute top-6 right-6 bg-[#0A0A0A] text-gray-500 border border-zinc-800 px-4 py-2 font-mono text-[10px] uppercase tracking-widest z-10">
                        Пробел + Мышь = Паннорамирование
                    </div>

                    {/* --- ИМИТАЦИЯ СШИВАЕМЫХ ПЛАНОВ НА ХОЛСТЕ --- */}
                    <div className="relative w-[800px] h-[600px] border border-zinc-800">
                        
                        {/* План 1 */}
                        <div className={`absolute top-10 left-10 w-[400px] h-[300px] bg-white transition-all
                            ${activeLayer === 'p1' ? 'border-4 border-[#FF4500] z-20 shadow-[0_0_30px_rgba(255,69,0,0.2)]' : 'border-2 border-zinc-600 z-10 opacity-60'}
                        `}>
                            <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwb2x5Z29uIGZpbGw9IiMzMzMiIHBvaW50cz0iMCAwIDIwIDIwIDAgNDAiLz48L3N2Zz4=')]"></div>
                            {activeLayer === 'p1' && (
                                <>
                                    <div className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-black"></div>
                                    <div className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-black"></div>
                                    <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-black"></div>
                                    <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-black"></div>
                                </>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference pointer-events-none">
                                <span className={`font-mono text-3xl font-bold tracking-widest ${activeLayer === 'p1' ? 'text-[#FF4500]' : 'text-gray-400'}`}>P1</span>
                            </div>
                        </div>

                        {/* План 2 */}
                        <div className={`absolute top-20 left-[350px] w-[350px] h-[400px] bg-white transition-all
                            ${activeLayer === 'p2' ? 'border-4 border-[#FF4500] z-20 shadow-[0_0_30px_rgba(255,69,0,0.2)]' : 'border-2 border-zinc-600 z-10 opacity-60'}
                        `}>
                            <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwb2x5Z29uIGZpbGw9IiMzMzMiIHBvaW50cz0iMjAgMCA0MCAyMCAyMCA0MCIvPjwvc3ZnPg==')]"></div>
                            {activeLayer === 'p2' && (
                                <>
                                    <div className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-black"></div>
                                    <div className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-black"></div>
                                    <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-black"></div>
                                    <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-black"></div>
                                </>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference pointer-events-none">
                                <span className={`font-mono text-3xl font-bold tracking-widest ${activeLayer === 'p2' ? 'text-[#FF4500]' : 'text-gray-400'}`}>P2</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- ПРАВАЯ ЧАСТЬ: ПАНЕЛЬ УПРАВЛЕНИЯ --- */}
                <div className="w-[320px] bg-[#0A0A0A] border-l border-zinc-800 flex flex-col shrink-0 z-20">
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-10">
                        {/* БЛОК 1: ИНСТРУМЕНТЫ */}
                        <div>
                            <h4 className="font-mono text-[11px] text-zinc-500 uppercase tracking-[0.2em] mb-4">{'// Инструменты'}</h4>
                            <div className="space-y-2">
                                {[
                                    { id: 'move', icon: Move, label: 'Перемещение' },
                                    { id: 'rotate', icon: RotateCw, label: 'Вращение' },
                                    { id: 'crop', icon: Crop, label: 'Кадрирование' },
                                    { id: 'poly', icon: Hexagon, label: 'Полигон. обрезка' }
                                ].map(tool => {
                                    const Icon = tool.icon;
                                    const isActive = activeTool === tool.id;
                                    return (
                                        <button 
                                            key={tool.id}
                                            onClick={() => setActiveTool(tool.id)}
                                            className={`w-full flex items-center p-4 transition-all
                                                ${isActive 
                                                    ? 'bg-[#1e1e1e] border border-[#FF4500] text-[#FF4500]' 
                                                    : 'bg-[#1e1e1e] border border-transparent text-gray-300 hover:bg-[#2a2a2a]'
                                                }
                                            `}
                                        >
                                            <Icon size={20} className="mr-4" />
                                            <span className="font-sans text-sm">{tool.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* БЛОК 2: СЛОИ */}
                        <div>
                            <h4 className="font-mono text-[11px] text-zinc-500 uppercase tracking-[0.2em] mb-4">{'// Слои'}</h4>
                            <div className="space-y-2">
                                {/* Слой 1 */}
                                <div 
                                    onClick={() => setActiveLayer('p1')}
                                    className={`p-4 transition-all cursor-pointer bg-[#1e1e1e] border
                                        ${activeLayer === 'p1' ? 'border-[#FF4500]' : 'border-transparent hover:bg-[#2a2a2a]'}
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center">
                                            <div className="w-3 h-3 bg-[#FF4500] mr-3"></div>
                                            <span className="font-sans text-sm font-medium">Левое крыло</span>
                                        </div>
                                        <div className="flex space-x-2 text-zinc-500">
                                            <ArrowUp size={16} className="hover:text-white" />
                                            <ArrowDown size={16} className="hover:text-white" />
                                            <Eye size={16} className="hover:text-white ml-2" />
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-zinc-800">
                                        <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-2">
                                            <span>Непрозрачность</span>
                                            <span className="text-white">100%</span>
                                        </div>
                                        <div className="flex items-center">
                                            {/* Ползунок в стиле скриншота */}
                                            <div className="flex-1 h-[2px] bg-zinc-700 relative">
                                                <div className="absolute left-0 top-0 bottom-0 w-full bg-[#FF4500]"></div>
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-4 bg-white cursor-pointer hover:scale-110 transition-transform"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Слой 2 */}
                                <div 
                                    onClick={() => setActiveLayer('p2')}
                                    className={`p-4 transition-all cursor-pointer bg-[#1e1e1e] border
                                        ${activeLayer === 'p2' ? 'border-[#FF4500]' : 'border-transparent hover:bg-[#2a2a2a]'}
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center">
                                            <div className="w-3 h-3 bg-[#5b9bd5] mr-3"></div>
                                            <span className="font-sans text-sm font-medium">Правое крыло</span>
                                        </div>
                                        <div className="flex space-x-2 text-zinc-500">
                                            <ArrowUp size={16} className="hover:text-white" />
                                            <ArrowDown size={16} className="hover:text-white" />
                                            <Eye size={16} className="hover:text-white ml-2" />
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-zinc-800">
                                        <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-2">
                                            <span>Непрозрачность</span>
                                            <span className="text-white">65%</span>
                                        </div>
                                        <div className="flex items-center">
                                            <div className="flex-1 h-[2px] bg-zinc-700 relative">
                                                <div className="absolute left-0 top-0 bottom-0 w-[65%] bg-[#5b9bd5]"></div>
                                                <div className="absolute left-[65%] top-1/2 -translate-y-1/2 w-3 h-4 bg-white cursor-pointer hover:scale-110 transition-transform -translate-x-1/2"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* БЛОК 3: СВОЙСТВА */}
                        <div>
                            <h4 className="font-mono text-[11px] text-zinc-500 uppercase tracking-[0.2em] mb-4">{'// Свойства слоя'}</h4>
                            <div className="space-y-2">
                                <div className="flex bg-[#1e1e1e] border border-transparent focus-within:border-[#FF4500] transition-colors">
                                    <div className="w-12 flex items-center justify-center font-mono text-xs text-zinc-500 border-r border-zinc-800">X</div>
                                    <input type="number" defaultValue="140" className="w-full px-4 py-3 font-mono text-sm bg-transparent outline-none text-white" />
                                </div>
                                <div className="flex bg-[#1e1e1e] border border-transparent focus-within:border-[#FF4500] transition-colors">
                                    <div className="w-12 flex items-center justify-center font-mono text-xs text-zinc-500 border-r border-zinc-800">Y</div>
                                    <input type="number" defaultValue="285" className="w-full px-4 py-3 font-mono text-sm bg-transparent outline-none text-white" />
                                </div>
                                <div className="flex bg-[#1e1e1e] border border-transparent focus-within:border-[#FF4500] transition-colors">
                                    <div className="w-12 flex items-center justify-center font-mono text-xs text-zinc-500 border-r border-zinc-800"><RotateCw size={14}/></div>
                                    <input type="number" defaultValue="0" className="w-full px-4 py-3 font-mono text-sm bg-transparent outline-none text-white" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            
            {/* --- НИЖНЯЯ ПАНЕЛЬ (БЕЛАЯ КАК НА СКРИНШОТЕ) --- */}
            <div className="h-20 bg-white border-t border-zinc-800 flex justify-between items-center px-8 shrink-0 z-30">
                <button 
                    onClick={() => navigate('stitching_select')}
                    className="bg-black text-white px-10 py-3 font-mono text-sm font-bold uppercase hover:bg-zinc-800 transition-colors"
                >
                    Назад
                </button>
                <button 
                    onClick={() => {
                        alert("Вызывается POST /api/v1/stitching/");
                        navigate('dashboard');
                    }}
                    className="bg-[#FF4500] text-white px-10 py-3 font-mono text-sm font-bold uppercase hover:bg-[#E03E00] transition-colors flex items-center"
                >
                    <span className="mr-2">{'>'}</span> Сшить
                </button>
            </div>
            
        </div>
    );
};