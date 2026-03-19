Два фикса на шаге 3 (StepWallEditor):

1. НАЛОЖЕНИЕ НЕ СОВПАДАЕТ С МАСКОЙ:
   Проблема: overlay <img> с object-fit:contain не совпадает 
   с background image в Fabric.js, потому что Fabric.js 
   позиционирует background image с конкретным scale и offset,
   а CSS object-fit:contain центрирует по-своему.
   
   Решение: НЕ использовать object-fit:contain на overlay.
   Вместо этого — читать точные координаты background image 
   из Fabric.js и позиционировать overlay абсолютно:
   
   В WallEditorCanvas.tsx после загрузки background image,
   сохранить его размеры и позицию:
   
   const [bgDims, setBgDims] = useState({ left: 0, top: 0, width: 0, height: 0 });
   
   // После c.setBackgroundImage(img, ...) добавить:
   setBgDims({
     left: 0,
     top: 0,
     width: (img.width ?? 0) * (img.scaleX ?? 1),
     height: (img.height ?? 0) * (img.scaleY ?? 1),
   });
   
   И overlay img стилизовать НЕ через object-fit, а через точные размеры:
   style={{
     opacity: overlayOpacity,
     position: 'absolute',
     left: bgDims.left + 'px',
     top: bgDims.top + 'px',
     width: bgDims.width + 'px',
     height: bgDims.height + 'px',
     pointerEvents: 'none',
     objectFit: 'fill',   // fill, НЕ contain — размеры уже точные
   }}
   
   Убрать из CSS .planOverlay: object-fit:contain, width:100%, height:100%.

2. СТИЛЬ ПОЛЗУНКОВ — все слайдеры должны выглядеть ОДИНАКОВО:
   Ползунки "Чувствительность", "Контраст", "Прозрачность" должны быть 
   такие же как "Толщина линии" — тот же CSS класс.
   
   Конкретно:
   - Track: оранжевый (#FF5722) до thumb, тёмный после
   - Thumb: прямоугольный серый (НЕ круглый), border-radius: 3px
   - Значение справа: серый цвет (#9E9E9E), НЕ оранжевый
   
   Использовать ТОТ ЖЕ CSS класс что у слайдера толщины линии 
   для всех трёх новых ползунков. Не создавать отдельные стили.