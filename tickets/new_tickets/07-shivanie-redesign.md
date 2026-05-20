import React, { useState } from 'react';
import { Layers, ArrowDown, ImageIcon, Check, ShieldAlert, ArrowLeft, FileImage } from 'lucide-react';

// Предполагается, что LayoutWithSidebar уже импортирован в вашем проекте
// import LayoutWithSidebar from './LayoutWithSidebar';

const StitchingSelectView = ({ navigate }) => {
    // Состояния фильтров
    const [selectedBuilding, setSelectedBuilding] = useState('A');
    const [floor, setFloor] = useState('3');
    
    // Состояние выбранных планов
    const [selectedPlans, setSelectedPlans] = useState([]);

    // Моковые данные доступных фрагментов этажа
    const availablePlans = [
        { id: 'p1', name: 'Левое крыло (Ауд. 301-315)', date: '22.03.26', rooms: 15 },
        { id: 'p2', name: 'Правое крыло (Ауд. 316-330)', date: '21.03.26', rooms: 14 },
        { id: 'p3', name: 'Центральный холл', date: '20.03.26', rooms: 3 },
        { id: 'p4', name: 'Пожарный выход B', date: '19.03.26', rooms: 5 },
        { id: 'p5', name: 'Секция столовой', date: '18.03.26', rooms: 2 },
        { id: 'p6', name: 'Переход в корпус B', date: '15.03.26', rooms: 4 }
    ];

    const togglePlan = (id) => {
        if (selectedPlans.includes(id)) {
            setSelectedPlans(selectedPlans.filter(p => p !== id));
        } else {
            setSelectedPlans([...selectedPlans, id]);
        }
    };

    const canStitch = selectedPlans.length >= 2;

    return (
        <LayoutWithSidebar navigate={navigate} activeRoute="stitching_select">
            <div className="flex flex-col h-full relative bg-[#E5E5E5]">
                
                <div className="p-8 md:p-12 max-w-6xl mx-auto w-full flex flex-col h-full">
                    
                    {/* --- HEADER --- */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 shrink-0">
                        <div>
                            <h1 className="text-5xl font-bold tracking-tight uppercase mb-4">Сшивание планов</h1>
                            <p className="font-mono text-gray-500 text-sm flex items-center">
                                <Layers size={16} className="mr-2 text-[#FF4500]" />
                                Шаг 1: Выбор обработанных фрагментов этажа
                            </p>
                        </div>
                        
                        <div className="flex items-center space-x-2 font-mono text-sm font-bold tracking-widest">
                            <div className="bg-[#FF4500] text-black px-4 py-2 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                01 ВЫБОР
                            </div>
                            <div className="text-gray-400">---</div>
                            <div className="bg-white text-gray-400 px-4 py-2 border-2 border-gray-300">
                                02 РЕДАКТОР
                            </div>
                        </div>
                    </div>

                    {/* --- ПАНЕЛЬ ПАРАМЕТРОВ (ПО ТИКЕТУ) --- */}
                    <div className="flex flex-wrap items-center gap-8 mb-10 pb-8 border-b-2 border-black shrink-0">
                        
                        {/* Фильтр: Объект */}
                        <div className="flex h-14 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_#FF4500] transition-shadow group cursor-pointer">
                            <div className="bg-black text-white px-5 flex items-center font-mono text-xs uppercase tracking-widest font-bold">
                                Объект
                            </div>
                            <div className="bg-white border-2 border-black border-l-0 relative flex items-center min-w-[160px]">
                                <select 
                                    className="w-full h-full px-5 text-xl font-bold bg-transparent outline-none cursor-pointer appearance-none pr-12 text-black group-hover:text-[#FF4500] transition-colors"
                                    value={selectedBuilding}
                                    onChange={(e) => setSelectedBuilding(e.target.value)}
                                >
                                    <option value="A">Корпус А</option>
                                    <option value="B">Корпус B</option>
                                    <option value="C">Корпус C</option>
                                </select>
                                <div className="absolute right-4 pointer-events-none">
                                    <ArrowDown size={20} className="text-black group-hover:text-[#FF4500] transition-colors" />
                                </div>
                            </div>
                        </div>

                        {/* Фильтр: Этаж */}
                        <div className="flex h-14 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_#FF4500] transition-shadow group">
                            <div className="bg-black text-white px-5 flex items-center font-mono text-xs uppercase tracking-widest font-bold">
                                Этаж
                            </div>
                            <div className="bg-white border-2 border-black border-l-0 flex items-center">
                                <input 
                                    type="number" 
                                    value={floor}
                                    onChange={(e) => setFloor(e.target.value)}
                                    className="w-24 h-full text-xl font-bold bg-transparent outline-none text-center text-black group-hover:text-[#FF4500] transition-colors"
                                />
                            </div>
                        </div>

                    </div>

                    {/* --- СТРОГИЙ СПИСОК ПЛАНОВ (LIST VIEW) --- */}
                    <div className="flex-1 overflow-y-auto pb-32 pr-2">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-mono text-sm uppercase tracking-widest font-bold text-black flex items-center">
                                <FileImage size={18} className="mr-3 text-gray-500" />
                                Доступные фрагменты ({availablePlans.length})
                            </h3>
                            <span className="font-mono text-xs bg-black text-white px-3 py-1">
                                ВЫБРАНО: <span className="text-[#FF4500] font-bold text-sm">{selectedPlans.length}</span>
                            </span>
                        </div>

                        <div className="space-y-4">
                            {availablePlans.map((plan) => {
                                const isSelected = selectedPlans.includes(plan.id);
                                return (
                                    <div 
                                        key={plan.id}
                                        onClick={() => togglePlan(plan.id)}
                                        className={`flex items-stretch bg-white border-2 cursor-pointer transition-all duration-200 group
                                            ${isSelected 
                                                ? 'border-[#FF4500] shadow-[6px_6px_0px_0px_rgba(255,69,0,1)] -translate-y-1' 
                                                : 'border-black hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1'
                                            }
                                        `}
                                    >
                                        {/* ПРЕВЬЮ */}
                                        <div className={`w-32 bg-[#F5F5F5] relative overflow-hidden shrink-0 flex items-center justify-center border-r-2 ${isSelected ? 'border-[#FF4500]' : 'border-black'}`}>
                                            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.2) 1px, transparent 1px)', backgroundSize: '10px 10px' }}></div>
                                            <ImageIcon size={24} className="text-gray-400" />
                                        </div>

                                        {/* ИНФОРМАЦИЯ */}
                                        <div className="p-5 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
                                            <div className="min-w-0">
                                                <div className="flex items-center space-x-3 mb-2">
                                                    <span className="font-mono text-[10px] bg-black text-white px-2 py-1 tracking-widest">{plan.id.toUpperCase()}</span>
                                                    <span className="font-mono text-xs text-gray-500">{plan.date}</span>
                                                </div>
                                                <h4 className="font-bold text-xl truncate">{plan.name}</h4>
                                            </div>

                                            {/* ПРАВАЯ ЧАСТЬ: УЗЛЫ И ЧЕКБОКС */}
                                            <div className="flex items-center space-x-8 shrink-0">
                                                <div className="font-mono text-xs text-gray-500 uppercase tracking-widest text-right hidden sm:block">
                                                    Размечено<br/><span className="text-black font-bold text-lg">{plan.rooms}</span> узлов
                                                </div>
                                                
                                                <div className={`w-8 h-8 border-2 flex items-center justify-center transition-colors shrink-0
                                                    ${isSelected ? 'bg-[#FF4500] border-[#FF4500]' : 'bg-transparent border-gray-400 group-hover:border-black'}
                                                `}>
                                                    {isSelected && <Check size={20} className="text-black font-bold" strokeWidth={3} />}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* --- STICKY BOTTOM ACTION BAR --- */}
                <div className="absolute bottom-0 left-0 w-full bg-[#E5E5E5]/90 backdrop-blur-md border-t-2 border-black p-6 md:px-12 flex justify-between items-center z-30">
                    <div className="w-1/2">
                        {!canStitch && (
                            <div className="font-mono text-xs text-[#FF4500] flex items-center bg-[#FF4500]/10 border border-[#FF4500] px-4 py-3 w-fit">
                                <ShieldAlert size={16} className="mr-3 shrink-0" />
                                МИНИМУМ 2 ПЛАНА ДЛЯ ОБЪЕДИНЕНИЯ
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={() => canStitch && navigate('stitching_editor')}
                        disabled={!canStitch}
                        className={`px-8 md:px-12 py-4 font-mono text-sm font-bold uppercase tracking-widest transition-all flex items-center shrink-0
                            ${canStitch 
                                ? 'bg-[#FF4500] text-black border-2 border-black hover:bg-black hover:text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' 
                                : 'bg-white text-gray-400 border-2 border-gray-300 cursor-not-allowed'
                            }
                        `}
                    >
                        Сшить ({selectedPlans.length})
                        <ArrowLeft size={18} className="ml-3 rotate-180" />
                    </button>
                </div>

            </div>
        </LayoutWithSidebar>
    );
};

export default StitchingSelectView;

