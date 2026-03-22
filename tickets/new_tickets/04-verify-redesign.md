Тикет: Редизайн блока "Запросы на регистрацию"Статус: К выполнениюПриоритет: ВысокийСвязанный компонент: AccountConfirmationView1. Визуальный стиль и типографикаДизайн опирается на строгий, бруталистский технический стиль с резкими границами, жесткими тенями без размытия и моноширинными шрифтами для системной информации.Шрифты (Tailwind классы)В проекте используется комбинация двух системных стеков (дополнительно загружать ничего не нужно, но можно использовать Inter и JetBrains Mono из Google Fonts для идеального совпадения):Основной (Без засечек / font-sans):Применение: Главные заголовки (ЗАПРОСЫ НА РЕГИСТРАЦИЮ), ФИО пользователей.Размеры: Заголовок страницы — text-3xl (мобильные) / text-4xl (десктоп). ФИО — text-xl.Начертание: font-bold (Жирное).Системный (Моноширинный / font-mono):Применение: ID заявок, дата/время, плашка счетчика, текст кнопок, подписи (EMAIL), текст чекбокса.Размеры: text-xs (12px) для бейджей, text-sm (14px) для кнопок и email.Особенности: Обязательно использование uppercase (все заглавные) и tracking-widest (увеличенный межбуквенный интервал) для кнопок и бейджей.Цветовая палитраОранжевый (Акцент): #FF4500 (Используется для кнопок, теней, иконок предупреждений и чекбокса).Черный (Основной): #000000 (Бордеры 2px, текст, плашка счетчика).Серый (Второстепенный): * Фон подложки: #E5E5E5 (Tailwind: bg-gray-200)Текст дат/иконок: text-gray-500 / text-gray-4002. Анатомия компонентов и UX/UI правила2.1 Шапка раздела (Header)Верстка: Flex-контейнер с выравниванием по нижнему краю (items-end). На мобильных устройствах элементы переносятся на новую строку (flex-wrap).Разделитель: Нижний бордер border-b-2 border-black pb-6.Плашка счетчика: Черный фон, белый текст. Тень: Оранжевая, смещенная вправо и вниз без размытия: shadow-[4px_4px_0px_0px_#FF4500].2.2 Карточка заявки (Request Card)Общий вид: Белый фон, border-2 border-black, внутренние отступы p-6.Hover-эффект (Важно!): При наведении карточка должна слегка приподниматься (hover:-translate-y-1) и отбрасывать резкую оранжевую тень (hover:shadow-[6px_6px_0px_0px_rgba(255,69,0,1)]).Декоративная линия: Слева абсолютно спозиционированная оранжевая полоса w-2, которая появляется только при наведении (opacity-0 group-hover:opacity-100 transition-opacity).2.3 Кнопки действий (Actions)Кнопки не должны сжиматься, если не хватает места (shrink-0 whitespace-nowrap).ОТКЛОНИТЬ: Белый фон, border-2 border-black. При наведении: заливка черным, текст белым.ПОДТВЕРДИТЬ: Оранжевый фон (bg-[#FF4500]), border-2 border-[#FF4500]. При наведении: фон и бордер становятся черными, текст белым.2.4 Чекбокс прав (Custom Checkbox)Скрываем стандартный системный <input type="checkbox">.Визуальный элемент: Квадрат w-5 h-5 border-2. По умолчанию прозрачный с серой рамкой.При активном состоянии: Заливка оранжевым #FF4500, рамка оранжевая, внутри появляется черная иконка галочки (Check).3. Исходный код (React / Tailwind CSS)Вставьте этот код в ваш проект для точного воспроизведения дизайна. Требуется библиотека lucide-react для иконок.import React, { useState } from 'react';
import { Check, Ban, Clock, ShieldAlert, User, CheckCircle2 } from 'lucide-react';

const AccountConfirmationBlock = () => {
    // Состояние заявок
    const [requests, setRequests] = useState([
        { id: 'REQ-8892', name: 'Иванов Алексей Петрович', email: 'ivanov.ap@uni.edu', date: '22.03.2026', time: '14:32', status: 'pending', canConfirm: false },
        { id: 'REQ-8895', name: 'Смирнова Елена В.', email: 'smirnova@uni.edu', date: '22.03.2026', time: '16:05', status: 'pending', canConfirm: false }
    ]);

    const pendingCount = requests.filter(r => r.status === 'pending').length;

    // Переключение чекбокса
    const toggleCanConfirm = (id) => {
        setRequests(prev => prev.map(req => req.id === id ? { ...req, canConfirm: !req.canConfirm } : req));
    };

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto w-full">
            
            {/* --- ЗАГОЛОВОК И СЧЕТЧИК --- */}
            <div className="flex flex-wrap justify-between items-start md:items-end mb-10 border-b-2 border-black pb-6 gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight uppercase mb-2">Запросы на регистрацию</h1>
                    <p className="font-mono text-gray-500 text-sm flex items-center">
                        <ShieldAlert size={16} className="mr-2 text-[#FF4500]" />
                        Требуется проверка администратором
                    </p>
                </div>
                {/* Плашка с резкой оранжевой тенью */}
                <div className="bg-black text-white px-4 py-2 font-mono text-sm border-2 border-black shadow-[4px_4px_0px_0px_#FF4500] shrink-0 whitespace-nowrap">
                    ОЖИДАЮТ: {pendingCount}
                </div>
            </div>

            {/* --- СПИСОК ЗАЯВОК --- */}
            <div className="space-y-6 pb-10">
                {requests.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-400 p-16 flex flex-col items-center justify-center text-gray-500 mt-10">
                        <CheckCircle2 size={64} className="mb-4 text-gray-300" strokeWidth={1} />
                        <h3 className="text-xl font-bold text-black">Все заявки обработаны</h3>
                        <p className="font-mono text-sm mt-2">Новых запросов на регистрацию нет.</p>
                    </div>
                ) : (
                    requests.map((req) => (
                        <div 
                            key={req.id} 
                            // Главный контейнер карточки с hover-эффектом
                            className="bg-white border-2 border-black p-6 flex flex-col lg:flex-row lg:items-center justify-between transition-all duration-300 transform hover:shadow-[6px_6px_0px_0px_rgba(255,69,0,1)] hover:-translate-y-1 relative group gap-6"
                        >
                            {/* Выезжающая оранжевая линия при наведении */}
                            <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#FF4500] opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            {/* Информация пользователя */}
                            <div className="flex-1 pl-4 md:pl-2 min-w-0">
                                <div className="flex items-center space-x-3 mb-2">
                                    <span className="font-mono text-xs bg-gray-200 px-2 py-1 text-black font-bold shrink-0">{req.id}</span>
                                    <span className="font-mono text-xs text-gray-500 flex items-center shrink-0">
                                        <Clock size={12} className="mr-1"/> {req.date} {req.time}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold flex items-center truncate">
                                    <User size={20} className="mr-2 text-gray-400 shrink-0" />
                                    <span className="truncate">{req.name}</span>
                                </h3>
                                
                                <div className="flex flex-col mt-4">
                                    <p className="text-gray-600 truncate font-mono text-sm mb-4">
                                        <span className="text-gray-400">EMAIL:</span> {req.email}
                                    </p>
                                    
                                    {/* Кастомный чекбокс */}
                                    <label className="flex items-center cursor-pointer group/checkbox w-fit">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only" 
                                            checked={req.canConfirm || false}
                                            onChange={() => toggleCanConfirm(req.id)}
                                        />
                                        <div className={`w-5 h-5 border-2 flex items-center justify-center mr-3 transition-colors ${req.canConfirm ? 'bg-[#FF4500] border-[#FF4500]' : 'bg-transparent border-gray-400 group-hover/checkbox:border-black'}`}>
                                            {req.canConfirm && <Check size={14} className="text-black font-bold" strokeWidth={3} />}
                                        </div>
                                        <span className="font-mono text-xs sm:text-sm text-gray-600 select-none group-hover/checkbox:text-black transition-colors uppercase tracking-wider">
                                            Дать право подтверждать учётные записи
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Кнопки */}
                            <div className="flex shrink-0 w-full lg:w-auto space-x-3 pt-4 lg:pt-0 border-t lg:border-t-0 border-dashed border-gray-300">
                                <button className="flex-1 lg:flex-none flex items-center justify-center px-4 py-3 bg-white border-2 border-black text-black hover:bg-black hover:text-white transition-colors font-mono text-sm font-bold uppercase whitespace-nowrap">
                                    <Ban size={16} className="mr-2 shrink-0" />
                                    Отклонить
                                </button>
                                <button className="flex-1 lg:flex-none flex items-center justify-center px-6 py-3 bg-[#FF4500] border-2 border-[#FF4500] text-black hover:bg-black hover:border-black hover:text-white transition-colors font-mono text-sm font-bold uppercase whitespace-nowrap">
                                    <Check size={18} className="mr-2 shrink-0" />
                                    Подтвердить
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AccountConfirmationBlock;
