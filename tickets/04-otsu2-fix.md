Убрать binary_otsu и bitwise_or из mask_service.py.
Вернуть только adaptive threshold (как было до этого изменения).

Вместо Otsu — увеличить blockSize с 15 до 25. 
Это расширит окно адаптивного порога и лучше обработает толстые стены,
не подхватывая мусор как Otsu.

Итого строка adaptive threshold должна быть:
binary = cv2.adaptiveThreshold(
    blurred, 255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV,
    blockSize=25,    # было 15
    C=8,             # было 10, чуть снизить — меньше шума
)

Больше НИЧЕГО не менять в mask_service.py.