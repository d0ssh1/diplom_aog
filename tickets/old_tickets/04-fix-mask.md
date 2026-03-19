1. ПЕРЕНЕСТИ ползунки "Чувствительность" и "Контраст" с шага 2 (StepPreprocess) 
   на шаг 3 (StepWallEditor). На шаге 2 оставить ТОЛЬКО кадрирование и поворот.

   В StepPreprocess.tsx: удалить paramSection, ползунки, preview логику, maskPreview.
   В StepWallEditor.tsx: добавить секцию "// НАСТРОЙКА" с двумя ползунками 
   в правую панель (ToolPanelV2), ПОД секцию "// РАЗМЕТКА".
   
   При изменении ползунков — debounced запрос на /mask-preview, 
   обновление background image в Fabric.js canvas.

2. СТИЛЬ ПОЛЗУНКОВ — вернуть прямоугольный thumb (не круглый):
```css
   input[type="range"] {
     -webkit-appearance: none;
     width: 100%;
     height: 4px;
     background: linear-gradient(to right, #FF5722 0%, #FF5722 var(--val), #555 var(--val), #555 100%);
     border-radius: 2px;
     outline: none;
   }
   input[type="range"]::-webkit-slider-thumb {
     -webkit-appearance: none;
     width: 16px;
     height: 20px;
     background: #999;
     border-radius: 3px;    /* прямоугольный, не круглый */
     cursor: pointer;
   }
```

3. ШРИФТЫ секций — убедиться что заголовки "// НАСТРОЙКА", "// РЕДАКТОР СТЕН" 
   используют font-family: monospace (как в ToolPanelV2), 
   а лейблы ползунков — тот же font-family что и labels кнопок инструментов.

НЕ менять backend — endpoint /mask-preview уже работает.
НЕ менять useWizard — blockSize/thresholdC уже в state.