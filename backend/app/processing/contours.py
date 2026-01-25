"""
Сервис выделения контуров и структурных элементов плана эвакуации

Обнаруживает и классифицирует:
- Стены (крупные линейные контуры)
- Помещения (замкнутые области)
- Двери (разрывы в контурах стен)
- Лестницы, выходы
"""

import os
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass
import numpy as np
import cv2


@dataclass
class StructuralElement:
    """Структурный элемент плана"""
    id: int
    element_type: str  # wall, room, door, stairs, exit
    contour: np.ndarray
    area: float
    perimeter: float
    center: Tuple[float, float]
    bounding_box: Tuple[int, int, int, int]  # x, y, width, height
    vertices: int
    aspect_ratio: float


class ContourService:
    """
    Сервис выделения и классификации структурных элементов
    
    Использует cv2.findContours для поиска контуров,
    затем классифицирует их по геометрическим признакам
    """
    
    def __init__(self, output_dir: str = "uploads/contours"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self._element_id = 0
    
    def find_contours(
        self, 
        binary_image: np.ndarray,
        mode: int = cv2.RETR_TREE,
        method: int = cv2.CHAIN_APPROX_SIMPLE
    ) -> Tuple[List[np.ndarray], Optional[np.ndarray]]:
        """
        Поиск контуров на бинарном изображении
        
        Args:
            binary_image: Бинарное изображение
            mode: Режим получения контуров:
                RETR_EXTERNAL - только внешние
                RETR_LIST - все контуры в списке
                RETR_TREE - иерархия контуров
            method: Метод аппроксимации:
                CHAIN_APPROX_NONE - все точки
                CHAIN_APPROX_SIMPLE - только ключевые точки
                
        Returns:
            contours: Список контуров
            hierarchy: Иерархия контуров
        """
        contours, hierarchy = cv2.findContours(
            binary_image.copy(),
            mode,
            method
        )
        return list(contours), hierarchy
    
    def approximate_contour(
        self, 
        contour: np.ndarray, 
        epsilon_factor: float = 0.02
    ) -> np.ndarray:
        """
        Аппроксимация контура полигоном (алгоритм Дугласа-Пекера)
        
        Упрощает контур, удаляя избыточные точки
        
        Args:
            contour: Исходный контур
            epsilon_factor: Множитель для epsilon (0.01-0.05)
            
        Returns:
            Упрощенный контур
        """
        epsilon = epsilon_factor * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        return approx
    
    def get_contour_properties(self, contour: np.ndarray) -> Dict[str, Any]:
        """
        Вычисление геометрических свойств контура
        
        Args:
            contour: Контур
            
        Returns:
            Dict со свойствами: area, perimeter, center, bounding_box, etc.
        """
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        x, y, w, h = cv2.boundingRect(contour)
        
        # Центр масс
        M = cv2.moments(contour)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx, cy = x + w // 2, y + h // 2
        
        # Соотношение сторон
        aspect_ratio = w / h if h > 0 else 0
        
        # Extent - отношение площади контура к площади bounding box
        rect_area = w * h
        extent = area / rect_area if rect_area > 0 else 0
        
        # Solidity - отношение площади контура к площади выпуклой оболочки
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        
        return {
            "area": area,
            "perimeter": perimeter,
            "center": (cx, cy),
            "bounding_box": (x, y, w, h),
            "vertices": len(contour),
            "aspect_ratio": aspect_ratio,
            "extent": extent,
            "solidity": solidity
        }
    
    def classify_element(
        self, 
        contour: np.ndarray,
        properties: Dict[str, Any],
        min_wall_aspect: float = 4.0,
        min_room_area: float = 1000,
        max_door_area: float = 500
    ) -> str:
        """
        Классификация контура по типу элемента
        
        Args:
            contour: Контур
            properties: Свойства контура
            min_wall_aspect: Минимальное соотношение сторон для стены
            min_room_area: Минимальная площадь для комнаты
            max_door_area: Максимальная площадь для двери
            
        Returns:
            Тип элемента: wall, room, door, unknown
        """
        area = properties["area"]
        aspect = properties["aspect_ratio"]
        vertices = properties["vertices"]
        solidity = properties["solidity"]
        
        # Шум - слишком маленькие объекты
        if area < 50:
            return "noise"
        
        # Стена - узкий вытянутый объект
        if aspect > min_wall_aspect or aspect < 1/min_wall_aspect:
            return "wall"
        
        # Комната - замкнутый прямоугольник средней/большой площади
        if area > min_room_area and 4 <= vertices <= 8 and solidity > 0.8:
            return "room"
        
        # Дверь - маленький объект
        if area < max_door_area and vertices <= 6:
            return "door"
        
        # Возможная лестница - характерная форма
        if vertices > 8 and solidity < 0.6:
            return "stairs"
        
        return "unknown"
    
    def extract_elements(
        self, 
        binary_image: np.ndarray,
        min_area: int = 100,
        epsilon_factor: float = 0.02
    ) -> List[StructuralElement]:
        """
        Извлечение и классификация всех элементов
        
        Args:
            binary_image: Бинарное изображение
            min_area: Минимальная площадь для учёта
            epsilon_factor: Фактор аппроксимации контуров
            
        Returns:
            Список структурных элементов
        """
        contours, hierarchy = self.find_contours(binary_image)
        elements = []
        
        for contour in contours:
            # Аппроксимация
            approx = self.approximate_contour(contour, epsilon_factor)
            
            # Свойства
            props = self.get_contour_properties(approx)
            
            # Фильтрация по площади
            if props["area"] < min_area:
                continue
            
            # Классификация
            element_type = self.classify_element(approx, props)
            
            if element_type == "noise":
                continue
            
            # Создание элемента
            self._element_id += 1
            element = StructuralElement(
                id=self._element_id,
                element_type=element_type,
                contour=approx,
                area=props["area"],
                perimeter=props["perimeter"],
                center=props["center"],
                bounding_box=props["bounding_box"],
                vertices=props["vertices"],
                aspect_ratio=props["aspect_ratio"]
            )
            elements.append(element)
        
        print(f"Найдено элементов: {len(elements)}")
        print(f"  - Стен: {sum(1 for e in elements if e.element_type == 'wall')}")
        print(f"  - Комнат: {sum(1 for e in elements if e.element_type == 'room')}")
        print(f"  - Дверей: {sum(1 for e in elements if e.element_type == 'door')}")
        
        return elements
    
    def draw_contours(
        self,
        image: np.ndarray,
        elements: List[StructuralElement],
        show_labels: bool = True
    ) -> np.ndarray:
        """
        Визуализация контуров на изображении
        
        Args:
            image: Исходное изображение (BGR)
            elements: Список элементов
            show_labels: Показывать метки типов
            
        Returns:
            Изображение с нарисованными контурами
        """
        result = image.copy()
        if len(result.shape) == 2:
            result = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)
        
        colors = {
            "wall": (0, 255, 0),      # Зеленый
            "room": (255, 0, 0),      # Синий
            "door": (0, 255, 255),    # Желтый
            "stairs": (255, 0, 255),  # Пурпурный
            "unknown": (128, 128, 128) # Серый
        }
        
        for element in elements:
            color = colors.get(element.element_type, (255, 255, 255))
            cv2.drawContours(result, [element.contour], -1, color, 2)
            
            if show_labels:
                cx, cy = element.center
                label = f"{element.element_type[:1].upper()}{element.id}"
                cv2.putText(
                    result, label, (int(cx)-10, int(cy)+5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1
                )
        
        return result
    
    def save_visualization(
        self,
        image: np.ndarray,
        elements: List[StructuralElement],
        output_path: str
    ) -> str:
        """
        Сохранение визуализации контуров
        
        Args:
            image: Исходное изображение
            elements: Список элементов
            output_path: Путь для сохранения
            
        Returns:
            Путь к сохраненному файлу
        """
        result = self.draw_contours(image, elements)
        cv2.imwrite(output_path, result)
        return output_path
    
    def get_wall_contours(
        self, 
        elements: List[StructuralElement]
    ) -> List[np.ndarray]:
        """
        Извлечение только контуров стен
        
        Args:
            elements: Список всех элементов
            
        Returns:
            Список контуров стен
        """
        return [e.contour for e in elements if e.element_type == "wall"]


# Для тестирования
if __name__ == "__main__":
    import sys
    from binarization import BinarizationService
    
    if len(sys.argv) < 2:
        print("Usage: python contours.py <image_path>")
        sys.exit(1)
    
    # Бинаризация
    bin_service = BinarizationService()
    mask, _, _ = bin_service.process(sys.argv[1])
    
    # Контуры
    contour_service = ContourService()
    elements = contour_service.extract_elements(mask)
    
    # Визуализация
    original = cv2.imread(sys.argv[1])
    output_path = sys.argv[1].replace('.', '_contours.')
    contour_service.save_visualization(original, elements, output_path)
    print(f"Визуализация сохранена: {output_path}")
