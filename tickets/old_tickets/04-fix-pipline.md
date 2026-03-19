ОТКАТИТЬ pipeline.py к оригинальным значениям HSV.
В функции remove_green_elements вернуть:
  hue_low=35, hue_high=85, sat_min=40, val_min=40, inpaint_radius=3
  
В функции remove_green_elements вернуть dilate kernel (3,3) iterations=1

Удалить функцию remove_blue_elements если была добавлена.

В remove_colored_elements оставить только:
  img = remove_green_elements(image)
  img = remove_red_elements(img)
  return img

НЕ менять ничего другого. git diff pipeline.py покажет что изменилось.