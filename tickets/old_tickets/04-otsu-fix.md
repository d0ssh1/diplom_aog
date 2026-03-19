В mask_service.py, после adaptive threshold, ДОБАВИТЬ глобальный Otsu 
и объединить два результата через bitwise_or:

# Adaptive (хорош для тонких стен)
binary_adaptive = cv2.adaptiveThreshold(
    blurred, 255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV,
    blockSize=15, C=10,
)

# Global Otsu (хорош для толстых стен — не "выедает" середину)
_, binary_otsu = cv2.threshold(
    blurred, 0, 255,
    cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
)

# Объединить — берём лучшее из обоих
binary = cv2.bitwise_or(binary_adaptive, binary_otsu)

# Далее существующий MORPH_CLOSE без изменений