import React, { useState, useEffect, useRef } from 'react';
import { 
    Search, CloudUpload, X, Crop, Wand2, Edit2, 
    Scissors, ArrowLeft, Image as ImageIcon, Layout,
    LogOut, Trash2, Eraser, PenLine, Scan,
    MapPin, Layers, Plus, Minus, Compass, Info,
    Save, Tag, Database, CheckSquare, GitCommit, Route, Play,
    Terminal, Download, Check, Box, Link2, ArrowRight, DoorOpen, Crosshair, Hand,
    ChevronLeft, Menu
} from 'lucide-react';

// --- НАСТРОЙКИ СТИЛЯ ---
const THEME = {
    orange: '#FF4500',
    black: '#0A0A0A',
    gray: '#E5E5E5',
    darkGray: '#1A1A1A'
};

const TopBar = ({ title, rightText, onRightClick, isDark = false }) => (
    <div className="flex h-14 w-full shrink-0">
        <div className={`flex-1 flex items-center px-6 font-mono text-sm font-bold tracking-wider ${isDark ? 'bg-[#FF4500] text-black' : 'bg-[#FF4500] text-black'}`}>
            {title}
        </div>
        <button onClick={onRightClick} className={`px-8 flex items-center justify-center font-mono text-xs transition-colors ${isDark ? 'bg-black text-white hover:bg-zinc-800' : 'bg-black text-white hover:bg-zinc-800'}`}>
            {rightText}
        </button>
    </div>
);

// ==========================================
// НОВЫЙ ЭКРАН: Менеджер Межэтажных Переходов (Орфанные узлы - Жесткая сетка)
// ==========================================
const TransitionsManagerView = ({ navigate }) => {
    // Иерархия: Здания -> Этажи
    const BUILDINGS = [
        {
            id: 'b_A', name: 'Корпус А (Главный)',
            floors: [
                { id: 'f_a1', name: 'Этаж 1 (Холл)' },
                { id: 'f_a2', name: 'Этаж 2 (Лаборатории)' },
                { id: 'f_a3', name: 'Этаж 3 (Аудитории)' }
            ]
        },
        {
            id: 'b_B', name: 'Корпус B (Инженерный)',
            floors: [
                { id: 'f_b1', name: 'Этаж B1 (Цоколь)' },
                { id: 'f_b2', name: 'Этаж B2 (Практика)' }
            ]
        }
    ];

    // Навигационное состояние
    const [selectedBuildingId, setSelectedBuildingId] = useState(null); // null = показываем список зданий
    const [activeFloorId, setActiveFloorId] = useState(null); // null = план не выбран
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Состояние сайдбара
    
    // Инструменты: 'pan' (Перемещение), 'teleport' (Создать), 'delete' (Удалить)
    const [activeTool, setActiveTool] = useState('pan'); 
    
    // Глобальное состояние всех телепортов
    const [teleports, setTeleports] = useState([]);
    
    // Состояния для модального окна создания Драфта
    const [modalOpen, setModalOpen] = useState(false);
    const [draftCoords, setDraftCoords] = useState(null);
    const [tpName, setTpName] = useState('Главный Лифт');
    const [tpTargetBuilding, setTpTargetBuilding] = useState(BUILDINGS[0].id);
    const [tpTargetFloor, setTpTargetFloor] = useState(BUILDINGS[0].floors[0].id);

    // При смене здания в модалке - обновляем доступный первый этаж
    useEffect(() => {
        const b = BUILDINGS.find(b => b.id === tpTargetBuilding);
        if (b) setTpTargetFloor(b.floors[0].id);
    }, [tpTargetBuilding]);

    // Состояния режима "Прыжка" (Связывания)
    const [mode, setMode] = useState('normal'); // 'normal' | 'placing_exit'
    const [linkingNodeId, setLinkingNodeId] = useState(null);

    // Вспомогательные переменные
    const activeBuilding = BUILDINGS.find(b => b.id === selectedBuildingId);
    const activeFloor = activeBuilding?.floors.find(f => f.id === activeFloorId);
    const teleportsOnCurrentFloor = teleports.filter(t => t.floorId === activeFloorId);

    // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

    const handleCanvasClick = (e) => {
        if (!activeFloorId) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (mode === 'normal' && activeTool === 'teleport') {
            setDraftCoords({ x, y });
            setTpTargetBuilding(selectedBuildingId || BUILDINGS[0].id); // По умолчанию текущее здание
            setModalOpen(true);
        } else if (mode === 'placing_exit') {
            const sourceNode = teleports.find(t => t.id === linkingNodeId);
            const newNodeId = `tp_${Date.now()}`;
            
            const newNode = {
                id: newNodeId,
                floorId: activeFloorId,
                x, y,
                name: `Выход: ${sourceNode.name}`,
                targetFloorId: sourceNode.floorId,
                status: 'linked',
                linkedNodeId: sourceNode.id
            };

            setTeleports(prev => prev.map(t => 
                t.id === linkingNodeId ? { ...t, status: 'linked', linkedNodeId: newNodeId } : t
            ).concat(newNode));

            setMode('normal');
            setLinkingNodeId(null);
            setActiveTool('pan');
        }
    };

    const handleNodeClick = (e, tp) => {
        e.stopPropagation(); // Чтобы не сработал клик по канвасу

        if (activeTool === 'delete') {
            // Удаляем сам телепорт и его парный телепорт (чтобы не было битых ссылок)
            setTeleports(prev => prev.filter(t => t.id !== tp.id && t.id !== tp.linkedNodeId));
        } else if (mode === 'normal' && tp.status === 'draft') {
            // Клик по драфту запускает процесс связывания
            startLinking(tp);
        }
    };

    const saveDraftTeleport = () => {
        setTeleports([...teleports, {
            id: `tp_${Date.now()}`,
            floorId: activeFloorId,
            x: draftCoords.x,
            y: draftCoords.y,
            name: tpName,
            targetFloorId: tpTargetFloor,
            status: 'draft',
            linkedNodeId: null
        }]);
        setModalOpen(false);
        setDraftCoords(null);
        setActiveTool('pan'); 
    };

    const startLinking = (node) => {
        setMode('placing_exit');
        setLinkingNodeId(node.id);
        
        // Находим здание, в котором находится целевой этаж, и "прыгаем" туда
        const targetBldg = BUILDINGS.find(b => b.floors.some(f => f.id === node.targetFloorId));
        if (targetBldg) {
            setSelectedBuildingId(targetBldg.id);
            setActiveFloorId(node.targetFloorId);
        }
        setActiveTool('teleport');
    };

    const cancelLinking = () => {
        const sourceNode = teleports.find(t => t.id === linkingNodeId);
        if (sourceNode) {
            const sourceBldg = BUILDINGS.find(b => b.floors.some(f => f.id === sourceNode.floorId));
            setSelectedBuildingId(sourceBldg?.id);
            setActiveFloorId(sourceNode.floorId); 
        }
        setMode('normal');
        setLinkingNodeId(null);
        setActiveTool('pan');
    };

    return (
        <div className="h-screen flex flex-col bg-black overflow-hidden font-sans">
            <TopBar title="TRANSITIONS_MANAGER // MASSSIVE_ROUTING" rightText="В дашборд" onRightClick={() => navigate('dashboard')} isDark={true} />

            {/* ОРАНЖЕВАЯ ПЛАШКА ПРИЦЕЛИВАНИЯ (Поверх всего) */}
            {mode === 'placing_exit' && (
                <div className="bg-[#FF4500] text-black px-6 py-3 flex items-center justify-between border-b-4 border-black z-40 shrink-0">
                    <div className="flex items-center">
                        <Crosshair size={24} className="mr-4 animate-pulse" />
                        <div>
                            <div className="font-mono text-sm font-bold uppercase tracking-widest">Укажите точку выхода для: {teleports.find(t=>t.id===linkingNodeId)?.name}</div>
                            <div className="font-mono text-[10px]">Кликните на текущий план, чтобы завершить привязку.</div>
                        </div>
                    </div>
                    <button onClick={cancelLinking} className="bg-black text-white px-6 py-2 font-mono text-xs hover:bg-white hover:text-black transition-colors uppercase font-bold border border-black">
                        Отменить привязку
                    </button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                
                {/* ЛЕВЫЙ САЙДБАР: Навигация Здания -> Этажи */}
                <div className={`bg-zinc-950 border-r-2 border-black flex flex-col shrink-0 z-20 transition-[width] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${isSidebarOpen ? 'w-72' : 'w-16'}`}>
                    {!selectedBuildingId ? (
                        <>
                            <div className="p-4 border-b-2 border-black bg-[#0A0A0A] flex items-center justify-between overflow-hidden">
                                <h4 className={`font-mono text-xs text-zinc-500 uppercase tracking-widest whitespace-nowrap transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>{'// Здания'}</h4>
                                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-zinc-500 hover:text-[#FF4500] transition-colors shrink-0">
                                    {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                                {BUILDINGS.map(b => (
                                    <button
                                        key={b.id}
                                        onClick={() => { setSelectedBuildingId(b.id); setIsSidebarOpen(true); }}
                                        className={`w-full text-left p-4 border-b border-zinc-900 font-mono text-sm text-zinc-300 hover:bg-zinc-900 hover:text-[#FF4500] transition-colors flex items-center justify-between group ${!isSidebarOpen && 'justify-center'}`}
                                        title={!isSidebarOpen ? b.name : ''}
                                    >
                                        <div className="flex items-center">
                                            <Box size={16} className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                                            <span className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin] duration-500 ease-in-out ${isSidebarOpen ? 'max-w-[200px] ml-3 opacity-100' : 'max-w-0 ml-0 opacity-0'}`}>
                                                {b.name}
                                            </span>
                                        </div>
                                        <ArrowRight size={16} className={`shrink-0 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all ${!isSidebarOpen && 'hidden'}`} />
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="p-4 border-b-2 border-black bg-[#0A0A0A] flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between mb-2">
                                    <button 
                                        onClick={() => { setSelectedBuildingId(null); setActiveFloorId(null); setIsSidebarOpen(true); }}
                                        disabled={mode === 'placing_exit'}
                                        className={`font-mono text-[10px] text-zinc-500 hover:text-[#FF4500] uppercase tracking-widest flex items-center transition-all disabled:opacity-30 disabled:hover:text-zinc-500 whitespace-nowrap ${isSidebarOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0 overflow-hidden'}`}
                                    >
                                        <ArrowLeft size={12} className="mr-2 shrink-0" />
                                        Назад к зданиям
                                    </button>
                                    {!isSidebarOpen && (
                                         <button 
                                            onClick={() => { setSelectedBuildingId(null); setActiveFloorId(null); setIsSidebarOpen(true); }}
                                            className="text-zinc-500 hover:text-[#FF4500] flex justify-center w-full mb-4 shrink-0"
                                            title="Назад к зданиям"
                                        >
                                            <ArrowLeft size={16} />
                                        </button>
                                    )}
                                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-zinc-500 hover:text-[#FF4500] transition-colors shrink-0">
                                        {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
                                    </button>
                                </div>
                                <h3 className={`font-mono text-sm font-bold text-white mt-2 truncate transition-all duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 h-0 mt-0'}`} title={activeBuilding?.name}>
                                    {activeBuilding?.name}
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-900">
                                {activeBuilding?.floors.map(floor => (
                                    <button
                                        key={floor.id}
                                        onClick={() => mode === 'normal' && setActiveFloorId(floor.id)}
                                        disabled={mode === 'placing_exit'}
                                        className={`w-full text-left p-4 border-b border-zinc-800 font-mono text-sm transition-colors flex items-center justify-between group
                                            ${activeFloorId === floor.id ? 'bg-[#FF4500] text-black font-bold' : 'text-zinc-400 hover:bg-black hover:text-white'}
                                            ${mode === 'placing_exit' && activeFloorId !== floor.id ? 'opacity-30 cursor-not-allowed' : ''}
                                            ${!isSidebarOpen && 'justify-center px-0'}
                                        `}
                                        title={!isSidebarOpen ? floor.name : ''}
                                    >
                                        <span className="flex items-center">
                                            <Layers size={14} className={`shrink-0 ${activeFloorId === floor.id ? 'opacity-100' : 'opacity-50'}`} /> 
                                            <span className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,margin] duration-500 ease-in-out ${isSidebarOpen ? 'max-w-[200px] ml-3 opacity-100' : 'max-w-0 ml-0 opacity-0'}`}>
                                                {floor.name}
                                            </span>
                                        </span>
                                        <div className={`w-2 h-2 bg-black rounded-full shrink-0 transition-opacity ${isSidebarOpen && activeFloorId === floor.id ? 'opacity-100' : 'opacity-0 hidden'}`} />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ЦЕНТР: Канвас и Нижний Тулбар */}
                <div className="flex-1 flex flex-col bg-zinc-200 relative overflow-hidden">
                    
                    {/* ХОЛСТ */}
                    <div className="flex-1 relative flex items-center justify-center p-8 overflow-hidden">
                        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                        
                        {!activeFloorId ? (
                            <div className="font-mono text-zinc-400 text-sm border-2 border-dashed border-zinc-400 p-8 flex flex-col items-center">
                                <MapPin size={48} className="mb-4 opacity-50" />
                                ВЫБЕРИТЕ ЭТАЖ В ЛЕВОМ МЕНЮ
                            </div>
                        ) : (
                            <div 
                                className={`w-full h-full max-w-[95%] max-h-[90vh] aspect-[16/9] bg-[#0A0A0A] border-4 border-black shadow-2xl relative z-10 transition-colors
                                    ${mode === 'placing_exit' ? 'border-[#FF4500] cursor-crosshair' : 
                                      activeTool === 'teleport' ? 'cursor-crosshair' : 
                                      activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                                `}
                                onClick={handleCanvasClick}
                            >
                                <div className="absolute top-4 left-4 font-mono text-xs font-bold text-zinc-600 uppercase pointer-events-none">PLAN_DATA // {activeFloor?.name}</div>

                                {/* Имитация геометрии стен */}
                                <svg viewBox="0 0 900 500" className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
                                    <rect x="100" y="100" width="700" height="300" fill="transparent" stroke="#3F3F46" strokeWidth="8"/>
                                    {activeFloorId.includes('a1') && <line x1="450" y1="100" x2="450" y2="400" stroke="#3F3F46" strokeWidth="8"/>}
                                    {activeFloorId.includes('a2') && <rect x="200" y="150" width="100" height="100" fill="transparent" stroke="#3F3F46" strokeWidth="4"/>}
                                    {activeFloorId.includes('b') && <circle cx="450" cy="250" r="100" fill="transparent" stroke="#3F3F46" strokeWidth="8"/>}
                                </svg>

                                {/* Рендер телепортов */}
                                {teleportsOnCurrentFloor.map(tp => (
                                    <div 
                                        key={tp.id} 
                                        onClick={(e) => handleNodeClick(e, tp)}
                                        className={`absolute w-12 h-12 -ml-6 -mt-6 flex items-center justify-center z-20 border-2 transition-transform hover:scale-110
                                            ${tp.status === 'draft' ? 'bg-[#FF4500]/20 border-[#FF4500] text-[#FF4500]' : 'bg-green-500/20 border-green-500 text-green-500'}
                                            ${activeTool === 'delete' ? 'cursor-pointer hover:bg-red-500/50 hover:border-red-500 hover:text-white' : 
                                              (tp.status === 'draft' && mode === 'normal') ? 'cursor-pointer hover:bg-[#FF4500] hover:text-black' : 'cursor-default'}
                                        `}
                                        style={{ left: `${tp.x}%`, top: `${tp.y}%` }}
                                        title={activeTool === 'delete' ? "Удалить телепорт" : tp.status === 'draft' ? "Кликните, чтобы привязать" : "Связанный узел"}
                                    >
                                        {activeTool === 'delete' ? <Trash2 size={24} /> : <DoorOpen size={24} />}
                                        
                                        {/* Подпись */}
                                        <div className={`absolute top-full mt-2 whitespace-nowrap px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest border pointer-events-none
                                            ${tp.status === 'draft' ? 'bg-black text-[#FF4500] border-[#FF4500]' : 'bg-black text-green-500 border-green-500'}
                                        `}>
                                            {tp.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* НИЖНИЙ ДОК-БАР ИНСТРУМЕНТОВ */}
                    <div className={`h-20 bg-zinc-950 border-t-2 border-black shrink-0 flex items-center justify-between px-6 z-20 transition-opacity ${mode === 'placing_exit' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                        
                        {/* Инструменты */}
                        <div className="flex space-x-2">
                            <button 
                                onClick={() => setActiveTool('pan')} 
                                className={`flex items-center px-6 py-4 border-2 transition-all outline-none font-mono text-sm uppercase tracking-widest font-bold
                                    ${activeTool === 'pan' ? 'border-[#FF4500] bg-[#FF4500]/10 text-[#FF4500]' : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                            >
                                <Hand size={20} className="mr-3" /> Перемещение
                            </button>
                            
                            <button 
                                onClick={() => setActiveTool('teleport')} 
                                className={`flex items-center px-6 py-4 border-2 transition-all outline-none font-mono text-sm uppercase tracking-widest font-bold
                                    ${activeTool === 'teleport' ? 'border-[#FF4500] bg-[#FF4500]/10 text-[#FF4500]' : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                            >
                                <DoorOpen size={20} className="mr-3" /> Добавить телепорт
                            </button>

                            <div className="w-px h-8 bg-zinc-800 mx-2 self-center"></div>

                            <button 
                                onClick={() => setActiveTool('delete')} 
                                className={`flex items-center px-6 py-4 border-2 transition-all outline-none font-mono text-sm uppercase tracking-widest font-bold
                                    ${activeTool === 'delete' ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-transparent text-zinc-400 hover:text-red-500 hover:bg-zinc-900'}`}
                            >
                                <Trash2 size={20} className="mr-3" /> Удалить
                            </button>
                        </div>

                        {/* Кнопка Сохранить */}
                        <button 
                            onClick={() => navigate('dashboard')} 
                            className="bg-[#FF4500] text-black border-2 border-black px-8 py-4 font-mono text-sm font-bold uppercase tracking-widest flex items-center hover:bg-white transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1 hover:translate-x-1"
                        >
                            <Save size={18} className="mr-3" />
                            Завершить работу
                        </button>
                    </div>

                </div>
            </div>

            {/* Brutalism Попап: Настройка нового телепорта */}
            {modalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-white border-4 border-black w-full max-w-lg shadow-[16px_16px_0px_0px_#FF4500] p-10 flex flex-col">
                        <h3 className="font-mono font-bold text-2xl mb-8 uppercase tracking-widest border-b-4 border-black pb-4 text-black">{'// Параметры телепорта'}</h3>
                        
                        <div className="space-y-6 flex-1">
                            <div>
                                <label className="font-mono text-xs text-zinc-500 uppercase tracking-widest block mb-2 font-bold">Имя узла (напр. Главный Лифт)</label>
                                <input autoFocus type="text" value={tpName} onChange={e=>setTpName(e.target.value)} className="w-full bg-zinc-100 border-2 border-black p-4 outline-none focus:border-[#FF4500] focus:bg-white font-mono text-sm transition-all text-black rounded-none" />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="font-mono text-xs text-zinc-500 uppercase tracking-widest block mb-2 font-bold">Целевое здание</label>
                                    <select value={tpTargetBuilding} onChange={e=>setTpTargetBuilding(e.target.value)} className="w-full bg-zinc-100 border-2 border-black p-4 outline-none focus:border-[#FF4500] font-mono text-xs text-black cursor-pointer rounded-none appearance-none">
                                        {BUILDINGS.map(b => (
                                            <option key={`tgt_${b.id}`} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="font-mono text-xs text-zinc-500 uppercase tracking-widest block mb-2 font-bold">Целевой этаж</label>
                                    <select value={tpTargetFloor} onChange={e=>setTpTargetFloor(e.target.value)} className="w-full bg-zinc-100 border-2 border-black p-4 outline-none focus:border-[#FF4500] font-mono text-xs text-black cursor-pointer rounded-none appearance-none">
                                        {BUILDINGS.find(b=>b.id === tpTargetBuilding)?.floors.map(f => (
                                            <option key={`tgt_${f.id}`} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-4 mt-12">
                            <button onClick={() => { setModalOpen(false); setActiveTool('pan'); setDraftCoords(null); }} className="flex-1 border-2 border-black p-4 font-mono text-sm font-bold uppercase hover:bg-zinc-200 transition-colors text-black rounded-none">Отмена</button>
                            <button onClick={saveDraftTeleport} className="flex-[2] bg-[#FF4500] text-black border-2 border-black p-4 font-mono text-sm font-bold uppercase hover:bg-black hover:text-[#FF4500] transition-colors shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1 hover:translate-x-1 rounded-none">Создать драфт</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ==========================================
// ЗАГЛУШКИ ОСТАЛЬНЫХ ЭКРАНОВ
// ==========================================
const DashboardView = ({ navigate }) => (
    <div className="h-screen flex flex-col bg-[#F0F0F0] overflow-hidden">
        <TopBar title="PROJECT_DIPLOM" rightText="Ник_админа" onRightClick={() => navigate('home')} isDark={true} />
        <div className="flex flex-1 overflow-hidden">
            <div className="w-72 bg-white flex flex-col border-r border-gray-200 shrink-0">
                <h2 className="text-3xl font-bold p-8">{'// Меню'}</h2>
                <div className="flex flex-col px-8 space-y-4">
                    <button onClick={() => navigate('upload')} className="text-left py-2 hover:text-[#FF4500] transition-colors flex items-center"><span className="mr-2 text-[#FF4500]">{'>'}</span> Загрузка и Векторизация</button>
                    <button onClick={() => navigate('transitions_manager')} className="text-left py-2 hover:text-[#FF4500] transition-colors flex items-center font-bold text-black"><span className="mr-2 text-[#FF4500]">{'>'}</span> Связи графов (Переходы)</button>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-[#E5E5E5]">
                <button onClick={() => navigate('transitions_manager')} className="bg-[#FF4500] text-black px-8 py-4 font-bold hover:bg-black hover:text-[#FF4500] transition-colors font-mono text-sm uppercase shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">Открыть менеджер переходов</button>
            </div>
        </div>
    </div>
);

const HomeView = ({ navigate }) => <div className="h-screen bg-black flex items-center justify-center font-mono"><button onClick={()=>navigate('dashboard')} className="bg-[#FF4500] text-black p-4 font-bold uppercase tracking-widest hover:bg-white transition-colors">Войти в панель администратора</button></div>;
const UploadView = ({ navigate }) => <div/>;
const EditorView = ({ navigate }) => <div/>;
const VectorPlanView = ({ navigate }) => <div/>;
const Build3DView = ({ navigate }) => <div/>;
const LoginView = ({ navigate }) => <div/>;
const MapUserView = ({ navigate }) => <div/>;

export default function App() {
    const [currentView, setCurrentView] = useState('transitions_manager'); 

    const renderView = () => {
        switch (currentView) {
            case 'home': return <HomeView navigate={setCurrentView} />;
            case 'dashboard': return <DashboardView navigate={setCurrentView} />;
            case 'transitions_manager': return <TransitionsManagerView navigate={setCurrentView} />;
            default: return <HomeView navigate={setCurrentView} />;
        }
    };

    return (
        <div className="font-sans antialiased text-gray-900 selection:bg-[#FF4500] selection:text-white">
            {renderView()}
        </div>
    );
}