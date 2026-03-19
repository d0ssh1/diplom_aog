Я понял проблему. На ваших скриншотах видно, что Claude (или другой ИИ) сломал общую структуру (Layout) страницы. 

Вместо того чтобы сделать приложение на весь экран (`100vh`) без скролла, он позволил контенту "вываливаться" вниз. Кроме того, он потерял CSS-код для сетки на фоне и неправильно отцентрировал черную рабочую область.

Чтобы заставить ИИ сделать всё идеально, ему нужно дать **жесткую структуру Flexbox-контейнеров** и **точный код для фона**.

Скопируйте текст ниже и отправьте его вашему ИИ (Claude Code). Это четкая инструкция, которая исправит и скролл, и сетку, и шрифты.

***

### 📝 Скопируйте и отправьте этот текст вашему ИИ:

> "Исправь экран редактора. Сейчас верстка сломалась, появился вертикальный скролл, пропала техническая сетка на фоне, а шрифты не соответствуют стилю Brutalism.
>
> **Правила, которые нужно строго соблюдать:**
> 1. **Никакого скролла всей страницы!** Главный контейнер экрана должен иметь классы `min-h-screen h-screen flex flex-col overflow-hidden`.
> 2. **Шрифты:** Для всех технических надписей, цифр, заголовков панелей и кнопок строго используй `font-mono`.
> 3. **Сетка на фоне:** Центральная часть (где находится картинка) должна иметь заливку `bg-zinc-200` и абсолютный слой поверх с CSS-паттерном сетки.
> 4. **Центрирование холста:** Черный холст должен быть идеально по центру, адаптироваться под размер экрана, но не превышать его (используй `max-h-[80vh] aspect-[16/9]`).
> 
> **Используй ровно вот эту структуру для экрана EditorView (скопируй этот каркас):**
> 
> ```jsx
> <div className="h-screen flex flex-col bg-black overflow-hidden font-sans">
>     {/* Верхний бар */}
>     <div className="h-14 bg-black flex items-center justify-between px-6 text-white border-b border-zinc-800 shrink-0">
>         {/* ... (содержимое верхнего бара) ... */}
>     </div>
> 
>     {/* Основная рабочая область (без скролла) */}
>     <div className="flex flex-1 overflow-hidden bg-zinc-200">
>         
>         {/* Левая часть: Канвас (Изображение) */}
>         <div className="flex-1 p-8 flex items-center justify-center relative overflow-hidden">
>             
>             {/* Сетка на фоне для технического вида (ОБЯЗАТЕЛЬНО ТАК) */}
>             <div 
>                 className="absolute inset-0 pointer-events-none" 
>                 style={{ 
>                     backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)', 
>                     backgroundSize: '20px 20px' 
>                 }}
>             ></div>
>             
>             {/* Сам холст (Черная область) */}
>             <div className="w-full h-full max-w-5xl max-h-[80vh] aspect-[16/9] bg-black shadow-2xl relative flex items-center justify-center border border-zinc-800 z-10">
>                 <span className="text-white font-mono text-sm tracking-widest opacity-50">IMAGE_DATA_RENDER</span>
>                 
>                 {/* Оранжевая рамка кадрирования */}
>                 <div className="absolute inset-10 border border-[#FF4500] border-dashed pointer-events-none">
>                     <div className="absolute -top-1 -left-1 w-2 h-2 bg-[#FF4500]"></div>
>                     <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF4500]"></div>
>                     <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[#FF4500]"></div>
>                     <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#FF4500]"></div>
>                 </div>
>             </div>
>         </div>
> 
>         {/* Правая часть: Тулбар (Фиксированная ширина 320px) */}
>         <div className="w-80 bg-zinc-900 flex flex-col text-white border-l border-zinc-800 shadow-2xl relative z-20 shrink-0">
>             
>             {/* Внутренний скролл только для инструментов, если они не влезают */}
>             <div className="p-6 flex-1 space-y-10 overflow-y-auto">
>                 {/* ... (здесь кнопки инструментов) ... */}
>             </div>
>             
>             {/* Навигация внизу тулбара (прижата к низу) */}
>             <div className="h-16 flex border-t border-zinc-800 shrink-0">
>                 {/* ... (кнопки Назад / Далее) ... */}
>             </div>
>         </div>
>     </div>
> </div>
> ```
> 
> Примени этот каркас. Обрати внимание на `h-screen` в самом верхнем div, на `overflow-hidden` и `shrink-0` — они гарантируют, что верстка не разъедется и не появится общий скролл страницы."

***

**Почему этот промпт сработает:**
Проблема ИИ (особенно когда он пишет много кода) в том, что он забывает базовые правила верстки Flexbox. Указав ему `h-screen`, `flex-1 overflow-hidden` для центральной области и `shrink-0` для тулбаров, мы жестко "запираем" интерфейс в рамках одного окна браузера. Скролл теперь (если он вообще понадобится) будет появляться только внутри правой панельки с инструментами, а картинка всегда будет идеально по центру.