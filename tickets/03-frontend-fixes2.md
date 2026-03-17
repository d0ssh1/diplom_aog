Инструкция по исправлению UI (Стиль: Technical Brutalism)

Привет! Я приложил скриншоты того, как сейчас выглядит интерфейс в папке 'fixes/fixes-pages':(BAD), и того, как он ДОЛЖЕН выглядеть (GOOD). Сейчас верстка и стили сильно отклонились от задуманного дизайна. Нам нужно вернуть строгий стиль профессионального инженерного софта.

Пожалуйста, внимательно изучи скриншоты и примени следующие исправления шаг за шагом.

⚠️ ГЛОБАЛЬНЫЕ ПРАВИЛА (Применять везде)

Zero Border Radius: Удали ВСЕ классы rounded, rounded-md, rounded-lg из проекта (кроме точек-индикаторов в верхнем баре). В брутализме не бывает мягких углов.

Типографика: Все заголовки секций, подписи, технические тексты и тексты в кнопках инструментов должны использовать font-mono.

No Scroll: Экраны не должны скроллиться целиком. Используй h-screen overflow-hidden flex flex-col для корневых контейнеров экранов.

🛠 ЗАДАЧА 1: Исправление экрана загрузки (UploadView)

Смотри скриншоты: upload-BAD.png (как сейчас) и upload-GOOD.png (как надо).

Проблемы сейчас: Правая панель залита темно-серым цветом, левая область не имеет четких границ, сломана общая структура (нет нижней панели действий).

Как нужно сделать (структура):
Контейнер экрана: min-h-screen flex flex-col bg-[#F5F5F5].
Внутри 2 основных блока по горизонтали (flex flex-1 overflow-hidden):

Левая часть (Дропзона):

Классы контейнера: flex-1 p-8 flex items-center justify-center bg-white border-r border-gray-200

Сама область перетаскивания должна иметь рамку: w-full h-full border-2 border-dashed border-[#FF4500] bg-[#FF4500]/5 flex flex-col items-center justify-center cursor-pointer.

Правая часть (Галерея файлов):

Классы контейнера: flex-1 flex flex-col bg-[#EAEAEA] (светло-серый фон!).

Снизу должна быть зафиксирована панель статуса: bg-zinc-600 text-white px-6 py-4 font-mono text-sm (текст: "Загружено X изображений").

Под ней блок кнопок (Назад/Далее): h-16 flex bg-white border-t border-gray-200. Кнопка "Далее" должна быть цвета bg-[#FF4500] text-white.

🛠 ЗАДАЧА 2: Исправление экрана редактора (EditorView)

Смотри скриншоты: tooluse-BAD.png (как сейчас) и tooluse-GOOD.png (как надо).

Проблемы сейчас: Отсутствует техническая сетка на фоне, холст картинки растянут неправильно (или прилипает к краям), инструменты выглядят как обычные кнопки с мягкими рамками и ховером.

Как нужно сделать (КАНВАС):

Левая область (где картинка) должна иметь фон bg-zinc-200 и p-8.

Поверх фона ОБЯЗАТЕЛЬНО должна лежать сетка (добавь этот div перед холстом):
<div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

Контейнер самого холста (черная область) должен быть строго по центру с сохранением пропорций: w-full h-full max-h-[80vh] aspect-[16/9] bg-black shadow-2xl relative border border-zinc-800.

Как нужно сделать (ИНСТРУМЕНТЫ - ПРАВАЯ ПАНЕЛЬ):

Панель имеет w-80 bg-zinc-900 border-l border-zinc-800.

Заголовки блоков (например, // РАЗМЕР ХОЛСТА) должны быть: font-mono text-xs text-zinc-500 mb-4 uppercase tracking-widest.

СТРУКТУРА КНОПОК ИНСТРУМЕНТОВ (КРИТИЧНО):
Кнопки не должны быть залиты серым! Используй следующую структуру для НЕАКТИВНОЙ кнопки:

<button className="w-full flex items-center p-3 border border-zinc-800 text-zinc-400 hover:border-[#FF4500] hover:text-[#FF4500] transition-all group bg-transparent outline-none">
    {/* Квадрат с иконкой */}
    <div className="w-10 h-10 flex items-center justify-center mr-4 bg-black group-hover:bg-[#FF4500] group-hover:text-black transition-colors">
        <Icon size={20} />
    </div>
    <span className="font-mono text-sm tracking-wide">Название</span>
</button>


Для АКТИВНОЙ кнопки:
Измени рамку кнопки на border-[#FF4500], добавь легкий фон bg-[#FF4500]/10 и сделай квадрат с иконкой полностью залитым bg-[#FF4500] text-black.

Пожалуйста, перепиши компоненты UploadView и EditorView, строго следуя этим правилам верстки и Tailwind-классам, чтобы результат один в один совпал со скриншотами GOOD.