В mask_service.py: убрать направленные MORPH_CLOSE (kernel_h 7x1 и kernel_v 1x7).
Оставить ТОЛЬКО один MORPH_CLOSE с маленьким ядром (3,3) iterations=1.

Итого после adaptive threshold должно быть ТОЛЬКО:
kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
mask = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

Убрать всё остальное (kernel_h, kernel_v, closed_h, closed_v, bitwise_or).