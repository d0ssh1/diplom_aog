Исправь кадрирование в StepPreprocess + CropOverlay:

1. НЕ использовать CSS transform: rotate() для поворота изображения.
   Вместо этого при rotation !== 0 создавать повёрнутый dataURL через 
   HTML Canvas (offscreen), и показывать уже повёрнутое изображение.
   
   В StepPreprocess.tsx:
   - Добавить useEffect который при изменении rotation или planUrl
     создаёт offscreen canvas, рисует повёрнутое изображение,
     получает dataURL и сохраняет в локальный state displayUrl.
   - <img src={displayUrl}> без CSS transform.
   
   Примерный код:
```typescript
   const [displayUrl, setDisplayUrl] = useState(planUrl);
   
   useEffect(() => {
     if (rotation === 0) { setDisplayUrl(planUrl); return; }
     const img = new Image();
     img.crossOrigin = 'anonymous';
     img.onload = () => {
       const canvas = document.createElement('canvas');
       const swap = rotation === 90 || rotation === 270;
       canvas.width = swap ? img.height : img.width;
       canvas.height = swap ? img.width : img.height;
       const ctx = canvas.getContext('2d')!;
       ctx.translate(canvas.width / 2, canvas.height / 2);
       ctx.rotate((rotation * Math.PI) / 180);
       ctx.drawImage(img, -img.width / 2, -img.height / 2);
       setDisplayUrl(canvas.toDataURL());
     };
     img.src = planUrl;
   }, [planUrl, rotation]);
```
   
2. CropOverlay больше не нужно учитывать rotation — 
   изображение уже повёрнуто. Рамка будет точно совпадать.

3. Убрать style={{ transform: rotate }} из <img>.

Не менять другие файлы. После — npx tsc --noEmit.