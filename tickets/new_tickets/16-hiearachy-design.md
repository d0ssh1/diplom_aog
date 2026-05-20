import React, { useState, useEffect } from 'react';
import { 
  GripVertical, Building2, Layers, Eye, Edit2, Trash2, 
  MoreVertical, Plus, Check, X, AlertTriangle, ExternalLink, 
  Image as ImageIcon, ChevronDown 
} from 'lucide-react';

// --- Исходные моковые данные ---
const initialData = [
  {
    id: 'b1',
    name: 'Корпус A',
    plansCount: 6,
    floors: [
      {
        id: 'f1',
        name: 'Этаж 1',
        plansCount: 3,
        isExpanded: true,
        plans: [
          { id: 'p1', name: 'План 1 – Офисные помещения', date: '12.05.2024 14:32', status: 'linked' },
          { id: 'p2', name: 'План 2 – Лестничный блок', date: '12.05.2024 14:45', status: 'linked' },
          { id: 'p3', name: 'План 3 – Коридорный блок', date: '13.05.2024 09:15', status: 'unlinked' },
        ]
      },
      { id: 'f2', name: 'Этаж 2', plansCount: 2, isExpanded: false, plans: [] },
      { id: 'f3', name: 'Этаж 3', plansCount: 1, isExpanded: false, plans: [] },
    ]
  },
  {
    id: 'b2',
    name: 'Корпус B',
    plansCount: 2,
    floors: [
      { id: 'f4', name: 'Этаж 1', plansCount: 1, isExpanded: false, plans: [] },
      { id: 'f5', name: 'Этаж 2', plansCount: 1, isExpanded: false, plans: [] },
    ]
  },
  {
    id: 'b3',
    name: 'Корпус C',
    plansCount: 0,
    floors: []
  }
];

const getPluralPlans = (count) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${count} планов`;
  if (mod10 === 1) return `${count} план`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} плана`;
  return `${count} планов`;
};

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDropdown, setActiveDropdown] = useState(null);
  
  // Состояния модальных окон
  const [modal, setModal] = useState({ isOpen: false, type: null, context: null });
  
  // Состояние редактирования (inline edit)
  const [editingItem, setEditingItem] = useState({ id: null, type: null, value: '' });

  // Имитация загрузки
  useEffect(() => {
    const timer = setTimeout(() => {
      setData(initialData);
      setLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Закрытие дропдаунов при клике вне
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // --- ОБРАБОТЧИКИ СОБЫТИЙ ---

  const handleOpenModal = (type, context = null) => {
    setModal({ isOpen: true, type, context });
    setActiveDropdown(null);
  };

  const closeModal = () => {
    setModal({ isOpen: false, type: null, context: null });
  };

  const toggleFloorExpand = (buildingId, floorId) => {
    setData(data.map(b => b.id === buildingId ? {
      ...b,
      floors: b.floors.map(f => f.id === floorId ? { ...f, isExpanded: !f.isExpanded } : f)
    } : b));
  };

  const startEditing = (id, type, currentValue) => {
    setEditingItem({ id, type, value: currentValue });
    setActiveDropdown(null);
  };

  const cancelEditing = () => {
    setEditingItem({ id: null, type: null, value: '' });
  };

  const saveEditing = () => {
    if (!editingItem.value.trim()) return;
    
    setData(data.map(b => {
      if (editingItem.type === 'building' && b.id === editingItem.id) {
        return { ...b, name: editingItem.value };
      }
      if (editingItem.type === 'floor') {
        return {
          ...b,
          floors: b.floors.map(f => f.id === editingItem.id ? { ...f, name: editingItem.value } : f)
        };
      }
      return b;
    }));
    cancelEditing();
  };

  const deleteItem = (id, type) => {
    if (type === 'building') {
      setData(data.filter(b => b.id !== id));
    } else if (type === 'floor') {
      setData(data.map(b => ({
        ...b,
        floors: b.floors.filter(f => f.id !== id)
      })));
    } else if (type === 'plan') {
      setData(data.map(b => ({
        ...b,
        plansCount: b.id === modal.context.buildingId ? Math.max(0, b.plansCount - 1) : b.plansCount,
        floors: b.floors.map(f => {
          if (f.id === modal.context.floorId) {
            return {
              ...f,
              plansCount: Math.max(0, f.plansCount - 1),
              plans: f.plans.filter(p => p.id !== id)
            };
          }
          return f;
        })
      })));
    }
    closeModal();
  };

  // --- КОМПОНЕНТЫ UI ---

  const Button = ({ children, variant = 'primary', className = '', ...props }) => {
    const baseStyle = "px-4 py-2 text-sm font-medium transition-colors focus:outline-none flex items-center justify-center rounded-none";
    const variants = {
      primary: "bg-[#FF5500] text-white hover:bg-[#E04B00] border border-[#FF5500]",
      secondary: "bg-[#2D2D2D] text-white hover:bg-[#1A1A1A] border border-[#2D2D2D]",
      outline: "bg-transparent text-gray-700 border border-gray-300 hover:bg-gray-50",
      ghost: "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent",
      danger: "bg-red-500 text-white hover:bg-red-600 border border-red-500",
    };
    return (
      <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
        {children}
      </button>
    );
  };

  // Скелетон загрузки
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F0F2F5] font-sans">
        <div className="bg-[#1A1A1A] text-white flex justify-between items-center px-6 py-4">
          <div className="text-sm font-semibold tracking-wider text-gray-300 uppercase">
            ОСНОВНОЕ СОСТОЯНИЕ – СПИСОК КОРПУСОВ И ЭТАЖЕЙ
          </div>
          <button className="text-gray-400 hover:text-white transition-colors" title="Закрыть">
            <X size={20} />
          </button>
        </div>
        <div className="p-8 text-gray-900">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <div className="h-8 w-48 bg-gray-300 animate-pulse mb-2"></div>
                <div className="h-4 w-72 bg-gray-300 animate-pulse"></div>
              </div>
              <div className="flex gap-4">
                <div className="h-10 w-40 bg-[#FF5500] opacity-30 animate-pulse"></div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 shadow-sm p-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 animate-pulse flex items-center px-4">
                  <div className="h-6 w-6 bg-gray-200 mr-4"></div>
                  <div className="h-5 w-32 bg-gray-200"></div>
                  <div className="ml-auto flex gap-4">
                    <div className="h-6 w-16 bg-gray-200"></div>
                    <div className="h-6 w-6 bg-gray-200"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#F0F2F5] font-sans selection:bg-[#FF5500] selection:text-white">
      {/* Черная плашка (Header) */}
      <div className="bg-[#1A1A1A] text-white flex justify-between items-center px-6 py-4">
        <div className="text-sm font-semibold tracking-wider text-gray-300 uppercase">
          ОСНОВНОЕ СОСТОЯНИЕ – СПИСОК КОРПУСОВ И ЭТАЖЕЙ
        </div>
        <button className="text-gray-400 hover:text-white transition-colors" title="Закрыть">
          <X size={20} />
        </button>
      </div>

      <div className="p-8 text-[#1A1A1A]">
        <div className="max-w-5xl mx-auto">
          
          {/* Шапка */}
          <header className="flex justify-between items-end mb-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">Корпуса и этажи</h1>
              <p className="text-gray-500 text-sm">Управление иерархией зданий, этажей и планов</p>
            </div>
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => handleOpenModal('addBuilding')}>
                <Plus size={16} className="mr-2" />
                Добавить корпус
              </Button>
            </div>
          </header>

          {/* Пустое состояние */}
          {data.length === 0 ? (
            <div className="bg-white border border-gray-200 shadow-sm p-16 flex flex-col items-center justify-center text-center">
              <Building2 size={64} className="text-gray-300 mb-4" strokeWidth={1} />
              <h3 className="text-lg font-semibold mb-2">Нет корпусов</h3>
              <p className="text-gray-500 mb-6 max-w-sm">
                Добавьте первый корпус, чтобы начать работу с иерархией здания
              </p>
              <Button variant="primary" onClick={() => handleOpenModal('addBuilding')}>
                <Plus size={16} className="mr-2" /> Добавить корпус
              </Button>
            </div>
          ) : (
          /* Основной список */
          <div className="space-y-5">
            {data.map((building) => (
              <div key={building.id} className="bg-white border border-gray-200 shadow-sm flex flex-col transition-all">
                
                {/* --- СТРОКА КОРПУСА --- */}
                <div className={`flex items-center p-4 group ${editingItem.id === building.id ? 'bg-[#FFF6F3]' : 'hover:bg-[#F9FAFB]'}`}>
                  <div className="w-16 flex items-center justify-between mr-3 text-gray-400 cursor-grab active:cursor-grabbing">
                    <GripVertical size={18} />
                    <Building2 size={20} className="text-gray-700" />
                  </div>
                  
                  {/* Inline редактирование */}
                  {editingItem.id === building.id && editingItem.type === 'building' ? (
                    <div className="flex-1 flex items-center gap-2 mr-4">
                      <input 
                        type="text" 
                        value={editingItem.value}
                        onChange={(e) => setEditingItem({...editingItem, value: e.target.value})}
                        className="flex-1 border border-[#FF5500] px-3 py-1.5 focus:outline-none rounded-none"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveEditing()}
                      />
                      <button onClick={saveEditing} className="bg-[#FF5500] text-white p-2 hover:bg-[#E04B00] transition-colors rounded-none">
                        <Check size={16} />
                      </button>
                      <button onClick={cancelEditing} className="bg-white border border-gray-300 text-gray-600 p-2 hover:bg-gray-50 transition-colors rounded-none">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 font-semibold text-base">{building.name}</div>
                  )}

                  {!editingItem.id && (
                    <div className="flex items-center gap-4 text-gray-500">
                      <span className="text-sm bg-[#F0F2F5] border border-gray-200 px-2 py-0.5 rounded-none flex items-center gap-1">
                        <ImageIcon size={14} /> {getPluralPlans(building.plansCount)}
                      </span>
                      <Check size={18} className="text-gray-400" />
                      
                      {/* Context Menu */}
                      <div className="relative">
                        <button 
                          className="p-1 hover:text-gray-900 rounded-none transition-colors"
                          onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === building.id ? null : building.id); }}
                        >
                          <MoreVertical size={18} />
                        </button>
                        
                        {activeDropdown === building.id && (
                          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 shadow-lg z-10 py-1 rounded-none">
                            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 rounded-none" onClick={() => handleOpenModal('addFloor', { buildingId: building.id })}>
                              <Plus size={16} className="text-gray-500" /> Добавить этаж
                            </button>
                            <button className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 rounded-none" onClick={() => startEditing(building.id, 'building', building.name)}>
                              <Edit2 size={16} className="text-gray-500" /> Редактировать корпус
                            </button>
                            <div className="border-t border-gray-100 my-1"></div>
                            <button className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 rounded-none" onClick={() => handleOpenModal('delete', { id: building.id, type: 'building', name: building.name })}>
                              <Trash2 size={16} /> Удалить корпус
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* --- СПИСОК ЭТАЖЕЙ С ИЕРАРХИЕЙ --- */}
                <div className="relative pb-2">
                  
                  {/* Итерация по этажам */}
                  {building.floors.map((floor) => (
                    <div key={floor.id} className="relative">
                      
                      {/* Вертикальная линия древа. Центр иконки здания находится на left: 69px */}
                      <div className="absolute left-[69px] top-0 h-full border-l-2 border-dotted border-gray-300" />
                      {/* Горизонтальная линия от древа к этажу */}
                      <div className="absolute left-[69px] top-[24px] w-[20px] border-t-2 border-dotted border-gray-300" />

                      <div className="relative z-10 flex flex-col group">
                        
                        {/* Строка этажа (контент начинается с pl-[89px] чтобы идеально стыковаться с линией) */}
                        <div className={`flex items-center py-3 pr-4 pl-[89px] border border-transparent transition-colors ${editingItem.id === floor.id ? 'bg-[#FFF6F3] border-[#FF5500]/20' : 'hover:bg-[#F9FAFB] hover:border-gray-100'}`}>
                          
                          <div className="flex items-center gap-2 mr-3 text-gray-400">
                            {/* Кнопка раскрытия (Chevron) */}
                            <div className="w-5 flex justify-center">
                              {floor.plans.length > 0 && (
                                <button onClick={() => toggleFloorExpand(building.id, floor.id)} className="p-0.5 hover:text-gray-800 rounded-none bg-white hover:bg-gray-100 transition-colors">
                                  <ChevronDown size={16} className={`transition-transform ${floor.isExpanded ? '' : '-rotate-90'}`} />
                                </button>
                              )}
                            </div>
                            <GripVertical size={18} className="cursor-grab active:cursor-grabbing hover:text-gray-600 transition-colors" />
                            <Layers size={18} className="text-gray-500" />
                          </div>

                          {/* Inline редактирование этажа */}
                          {editingItem.id === floor.id && editingItem.type === 'floor' ? (
                            <div className="flex-1 flex items-center gap-2 mr-4 ml-2">
                              <input 
                                type="text" 
                                value={editingItem.value}
                                onChange={(e) => setEditingItem({...editingItem, value: e.target.value})}
                                className="flex-1 border border-[#FF5500] px-3 py-1 focus:outline-none rounded-none text-sm"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && saveEditing()}
                              />
                              <button onClick={saveEditing} className="bg-[#FF5500] text-white p-1.5 hover:bg-[#E04B00] transition-colors rounded-none">
                                <Check size={16} />
                              </button>
                              <button onClick={cancelEditing} className="bg-white border border-gray-300 text-gray-600 p-1.5 hover:bg-gray-50 transition-colors rounded-none">
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center gap-3">
                              <span className="font-medium text-sm">{floor.name}</span>
                              <span className="text-xs text-gray-400">{getPluralPlans(floor.plansCount)}</span>
                            </div>
                          )}

                          {/* Действия с этажом */}
                          {!editingItem.id && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#F9FAFB]">
                              <Button variant="ghost" className="p-1.5"><Eye size={16} /></Button>
                              <Button variant="ghost" className="p-1.5" onClick={() => startEditing(floor.id, 'floor', floor.name)}><Edit2 size={16} /></Button>
                              <Button variant="ghost" className="p-1.5 hover:text-red-500" onClick={() => handleOpenModal('delete', { id: floor.id, type: 'floor', name: floor.name })}><Trash2 size={16} /></Button>
                            </div>
                          )}
                        </div>

                        {/* Развернутый список планов */}
                        {floor.isExpanded && floor.plans.length > 0 && (
                          <div className="pl-[89px] pr-4 pb-3">
                            {/* Контейнер планов с внутренней тенью для контраста */}
                            <div className="bg-[#F8F9FA] border border-gray-200 shadow-inner p-3 space-y-2">
                              {floor.plans.map(plan => (
                                <div key={plan.id} className="flex items-center gap-4 p-3 bg-white border border-gray-200 shadow-sm hover:border-gray-300 transition-colors">
                                  <div className="w-16 h-12 bg-[#F8F9FA] border border-gray-200 flex items-center justify-center text-gray-300">
                                    <ImageIcon size={20} />
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium">{plan.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">Загружен: {plan.date}</div>
                                  </div>
                                  <div>
                                    {plan.status === 'linked' ? (
                                      <span className="bg-green-50 text-green-700 border border-green-200 text-xs px-2 py-1 rounded-none font-medium">Привязан к отсеку</span>
                                    ) : (
                                      <span className="bg-gray-100 text-gray-600 border border-gray-200 text-xs px-2 py-1 rounded-none font-medium">Не привязан</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-gray-400">
                                    <button className="p-1.5 hover:text-gray-900 rounded-none"><Eye size={16} /></button>
                                    <button className="p-1.5 hover:text-gray-900 rounded-none"><ExternalLink size={16} /></button>
                                    <button 
                                      className="p-1.5 hover:text-red-500 transition-colors rounded-none"
                                      onClick={() => handleOpenModal('delete', { 
                                        id: plan.id, 
                                        type: 'plan', 
                                        name: plan.name,
                                        buildingId: building.id,
                                        floorId: floor.id
                                      })}
                                      title="Удалить план"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                      </div>
                    </div>
                  ))}

                  {/* --- КНОПКА ДОБАВЛЕНИЯ ЭТАЖА --- */}
                  <div className="relative mt-1">
                    {/* Эта кнопка всегда последняя в ветке, поэтому её вертикальная линия обрывается */}
                    <div className="absolute left-[69px] top-0 h-[24px] border-l-2 border-dotted border-gray-300" />
                    <div className="absolute left-[69px] top-[24px] w-[20px] border-t-2 border-dotted border-gray-300" />
                    
                    <div className="relative z-10 pl-[89px] pr-4 py-2 mb-1">
                      <button 
                        onClick={() => handleOpenModal('addFloor', { buildingId: building.id })}
                        className="w-full py-2.5 border border-dashed border-gray-300 text-gray-500 hover:border-[#FF5500] hover:text-[#FF5500] transition-colors flex items-center justify-center gap-2 text-sm font-medium rounded-none bg-gray-50 hover:bg-[#FFF6F3]"
                      >
                        <Plus size={16} /> Добавить этаж
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
          )}

        </div>
      </div>

      {/* --- МОДАЛЬНЫЕ ОКНА --- */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          
          {/* Добавление корпуса */}
          {modal.type === 'addBuilding' && (
            <AddBuildingModal onClose={closeModal} onSubmit={(name) => {
              setData([...data, { id: `b${Date.now()}`, name, plansCount: 0, floors: [] }]);
              closeModal();
            }} />
          )}

          {/* Добавление этажа */}
          {modal.type === 'addFloor' && (
            <AddFloorModal onClose={closeModal} buildingName={data.find(b => b.id === modal.context.buildingId)?.name} onSubmit={(floorData) => {
              setData(data.map(b => {
                if (b.id === modal.context.buildingId) {
                  return {
                    ...b,
                    floors: [...b.floors, { id: `f${Date.now()}`, name: floorData.name || `Этаж ${floorData.number}`, plansCount: 0, isExpanded: false, plans: [] }]
                  };
                }
                return b;
              }));
              closeModal();
            }} />
          )}

          {/* Удаление */}
          {modal.type === 'delete' && (
            <div className="bg-white w-full max-w-md p-6 shadow-xl rounded-none relative">
              <div className="flex items-start gap-4">
                <div className="mt-1 text-[#FF5500]">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-2">
                    Удалить {modal.context.type === 'building' ? 'корпус' : modal.context.type === 'floor' ? 'этаж' : 'план'}?
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Вы действительно хотите удалить {modal.context.type === 'building' ? 'корпус' : modal.context.type === 'floor' ? 'этаж' : 'план'} «{modal.context.name}»?<br/>
                    {modal.context.type === 'building' && 'Все этажи и планы внутри него будут удалены. '}
                    {modal.context.type === 'floor' && 'Все планы внутри него будут удалены. '}
                    Это действие нельзя отменить.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={closeModal}>Отмена</Button>
                <Button variant="danger" onClick={() => deleteItem(modal.context.id, modal.context.type)}>Удалить</Button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// --- Компонент модального окна добавления корпуса ---
function AddBuildingModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError(true);
      return;
    }
    onSubmit(name);
  };

  return (
    <div className="bg-white w-full max-w-md p-6 shadow-xl rounded-none relative">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 rounded-none">
        <X size={20} />
      </button>
      
      <h2 className="text-xl font-bold mb-6">Добавить корпус</h2>
      
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-gray-700">
          Название корпуса <span className="text-red-500">*</span>
        </label>
        <input 
          type="text" 
          placeholder="Введите название корпуса"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(false); }}
          className={`w-full border px-4 py-2 focus:outline-none rounded-none text-sm transition-colors ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-[#FF5500]'}`}
          autoFocus
        />
        {error && <p className="text-red-500 text-xs mt-1">Название обязательно</p>}
      </div>

      <div className="flex justify-end gap-3 mt-8">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors rounded-none">
          Отмена
        </button>
        <button 
          onClick={handleSubmit} 
          className={`px-4 py-2 text-sm font-medium text-white transition-colors rounded-none ${name.trim() ? 'bg-[#FF5500] hover:bg-[#E04B00]' : 'bg-[#FFB291] cursor-not-allowed'}`}
          disabled={!name.trim()}
        >
          Создать
        </button>
      </div>
    </div>
  );
}

// --- Компонент модального окна добавления этажа ---
function AddFloorModal({ onClose, buildingName, onSubmit }) {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="bg-white w-full max-w-md p-6 shadow-xl rounded-none relative">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 rounded-none">
        <X size={20} />
      </button>
      
      <h2 className="text-xl font-bold mb-6 pr-8">Добавить этаж в {buildingName}</h2>
      
      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">
            Номер этажа <span className="text-red-500">*</span>
          </label>
          <input 
            type="text" 
            placeholder="Например: 1, 2, 3, -1"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="w-full border border-gray-300 px-4 py-2 focus:outline-none focus:border-[#FF5500] rounded-none text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700">
            Название (необязательно)
          </label>
          <input 
            type="text" 
            placeholder="Например: Подвал, Технический этаж"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 px-4 py-2 focus:outline-none focus:border-[#FF5500] rounded-none text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors rounded-none">
          Отмена
        </button>
        <button 
          onClick={() => onSubmit({ number, name })} 
          className={`px-4 py-2 text-sm font-medium text-white transition-colors rounded-none ${number.trim() ? 'bg-[#FF5500] hover:bg-[#E04B00]' : 'bg-[#FFB291] cursor-not-allowed'}`}
          disabled={!number.trim()}
        >
          Добавить
        </button>
      </div>
    </div>
  );
}