Выполни следующий Python-скрипт прямо из backend/:

import cv2
import numpy as np

# Найди последнюю маску
import glob
masks = glob.glob('uploads/masks/*.png')
# Исключи debug файлы
masks = [m for m in masks if 'debug' not in m and 'skeleton' not in m and 'corridor' not in m]
masks.sort(key=lambda x: __import__('os').path.getmtime(x), reverse=True)
mask_path = masks[0]
print(f"Mask: {mask_path}")

mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
h, w = mask.shape
print(f"Size: {w}x{h}")

# Инвертируем: свободное пространство = белое
free = cv2.bitwise_not(mask)

# Вариант: НЕ делаем MORPH_OPEN, просто скелетонизируем ВСЁ свободное
from skimage.morphology import skeletonize
skeleton_all = skeletonize(free > 0).astype(np.uint8) * 255

# Считаем связные компоненты скелета
num_labels, labels = cv2.connectedComponents(skeleton_all)
print(f"Skeleton ALL (без MORPH_OPEN): {num_labels - 1} components")

# Находим самый большой компонент
biggest = 0
biggest_size = 0
for i in range(1, num_labels):
    size = np.sum(labels == i)
    if size > biggest_size:
        biggest_size = size
        biggest = i
print(f"Biggest component: {biggest_size} pixels ({biggest_size/np.sum(skeleton_all>0)*100:.0f}% of skeleton)")

cv2.imwrite('uploads/masks/skeleton_ALL_debug.png', skeleton_all)

# Также попробуем downscale + A* на сетке
small = cv2.resize(free, (w//4, h//4), interpolation=cv2.INTER_NEAREST)
print(f"Downscaled free space: {small.shape[1]}x{small.shape[0]}")
print(f"Free pixels in downscaled: {np.sum(small>0)} ({np.sum(small>0)/small.size*100:.0f}%)")
cv2.imwrite('uploads/masks/free_space_small_debug.png', small)

print("Done. Check uploads/masks/skeleton_ALL_debug.png and free_space_small_debug.png")