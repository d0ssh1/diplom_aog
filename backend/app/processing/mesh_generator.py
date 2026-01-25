"""
Сервис генерации 3D моделей из 2D контуров стен

Преобразует 2D контуры плана эвакуации в 3D геометрию:
1. Извлечение контуров стен из бинарной маски
2. Вытягивание (extrusion) по оси Z на высоту этажа
3. Экспорт в форматы OBJ, GLB, STL
"""

import os
from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass
import numpy as np

try:
    import trimesh
    from trimesh.creation import extrude_polygon
    from trimesh.path.polygons import paths_to_polygons
except ImportError:
    trimesh = None
    print("Warning: trimesh не установлен")

try:
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.ops import unary_union
except ImportError:
    Polygon = None
    print("Warning: shapely не установлен. Установите: pip install shapely")


@dataclass
class MeshExportResult:
    """Результат экспорта 3D модели"""
    mesh_id: int
    obj_path: Optional[str]
    glb_path: Optional[str]
    stl_path: Optional[str]
    vertices_count: int
    faces_count: int


class MeshGeneratorService:
    """
    Сервис генерации 3D моделей этажей
    
    Преобразует 2D контуры стен в 3D геометрию
    путём вытягивания (extrusion) на заданную высоту
    """
    
    def __init__(
        self, 
        output_dir: str = "uploads/models",
        default_floor_height: float = 1.5,
        default_wall_thickness: float = 0.2,
        pixels_per_meter: float = 50.0
    ):
        """
        Args:
            output_dir: Директория для сохранения моделей
            default_floor_height: Высота этажа по умолчанию (метры)
            default_wall_thickness: Толщина стен (метры)
            pixels_per_meter: Пикселей на метр для калибровки
        """
        self.output_dir = output_dir
        self.floor_height = default_floor_height
        self.wall_thickness = default_wall_thickness
        self.pixels_per_meter = pixels_per_meter
        
        os.makedirs(output_dir, exist_ok=True)
        self._mesh_id = 0
    
    def contour_to_polygon(
        self, 
        contour: np.ndarray,
        scale: float = 1.0
    ) -> Optional['Polygon']:
        """
        Преобразование OpenCV контура в Shapely Polygon
        
        Args:
            contour: OpenCV контур (Nx1x2 или Nx2)
            scale: Масштабный коэффициент (пиксели -> метры)
            
        Returns:
            Shapely Polygon или None если невалидный
        """
        if Polygon is None:
            raise RuntimeError("Shapely не установлен")
        
        # Приведение к форме (N, 2)
        if len(contour.shape) == 3:
            points = contour.reshape(-1, 2)
        else:
            points = contour
        
        # Масштабирование
        points = points.astype(float) * scale
        
        # Нужно минимум 3 точки для полигона
        if len(points) < 3:
            return None
        
        try:
            poly = Polygon(points)
            if not poly.is_valid:
                poly = poly.buffer(0)  # Исправление самопересечений
            return poly if poly.is_valid else None
        except Exception:
            return None
    
    def contours_to_polygons(
        self, 
        contours: List[np.ndarray],
        image_height: int
    ) -> List['Polygon']:
        """
        Преобразование списка контуров в полигоны
        
        Args:
            contours: Список OpenCV контуров
            image_height: Высота изображения для инверсии Y
            
        Returns:
            Список валидных полигонов
        """
        scale = 1.0 / self.pixels_per_meter
        polygons = []
        
        for contour in contours:
            geom = self.contour_to_polygon(contour, scale)
            if geom is not None:
                # Обрабатываем и Polygon, и MultiPolygon
                if geom.geom_type == 'Polygon':
                    geoms = [geom]
                elif geom.geom_type == 'MultiPolygon':
                    geoms = list(geom.geoms)
                else:
                    continue
                
                for poly in geoms:
                    # Инвертируем Y координату (OpenCV: Y вниз, 3D: Y вверх)
                    try:
                        coords = list(poly.exterior.coords)
                        flipped = [(x, (image_height * scale) - y) for x, y in coords]
                        # Воссоздаем с инверсией
                        new_poly = Polygon(flipped)
                        
                        # Также инвертируем дырки (interiors)
                        if poly.interiors:
                            holes = []
                            for hole in poly.interiors:
                                hole_coords = list(hole.coords)
                                flipped_hole = [(x, (image_height * scale) - y) for x, y in hole_coords]
                                holes.append(flipped_hole)
                            new_poly = Polygon(flipped, holes)
                            
                        if new_poly.is_valid:
                            polygons.append(new_poly)
                    except Exception as e:
                        print(f"Ошибка обработки полигона: {e}")
        
        return polygons
    
    def create_extruded_wall(
        self, 
        polygon: 'Polygon',
        height: float = None
    ) -> Optional['trimesh.Trimesh']:
        """
        Создание 3D стены вытягиванием полигона
        
        Args:
            polygon: 2D полигон стены
            height: Высота вытягивания (метры)
            
        Returns:
            Trimesh объект или None
        """
        if trimesh is None:
            raise RuntimeError("Trimesh не установлен")
        
        height = height or self.floor_height
        
        try:
            # Получаем координаты внешней границы
            coords = np.array(polygon.exterior.coords)
            
            # Создаем 2D путь и вытягиваем
            mesh = trimesh.creation.extrude_polygon(
                polygon, 
                height=height
            )
            
            return mesh
        except Exception as e:
            print(f"Ошибка создания стены: {e}")
            return None
    
    def create_floor_mesh(
        self,
        width: float,
        depth: float,
        z_offset: float = 0.0
    ) -> 'trimesh.Trimesh':
        """
        Создание меша пола
        
        Args:
            width: Ширина (X)
            depth: Глубина (Y)  
            z_offset: Смещение по Z
            
        Returns:
            Меш пола
        """
        if trimesh is None:
            raise RuntimeError("Trimesh не установлен")
        
        # Создаем плоский прямоугольник
        floor = trimesh.creation.box(
            extents=[width, depth, 0.1]
        )
        floor.apply_translation([width/2, depth/2, z_offset - 0.05])
        
        return floor
    
    def generate_floor_model(
        self,
        wall_contours: List[np.ndarray],
        image_width: int,
        image_height: int,
        floor_number: int = 1,
        include_floor: bool = True,
        include_ceiling: bool = False
    ) -> Optional['trimesh.Trimesh']:
        """
        Генерация полной 3D модели этажа
        
        Args:
            wall_contours: Список контуров стен
            image_width: Ширина исходного изображения
            image_height: Высота исходного изображения
            floor_number: Номер этажа
            include_floor: Добавить пол
            include_ceiling: Добавить потолок
            
        Returns:
            Объединенный меш этажа
        """
        if trimesh is None:
            raise RuntimeError("Trimesh не установлен")
        
        print(f"Генерация 3D модели этажа {floor_number}...")
        print(f"  Контуров стен: {len(wall_contours)}")
        
        meshes = []
        
        # Преобразуем контуры в полигоны
        polygons = self.contours_to_polygons(wall_contours, image_height)
        print(f"  Валидных полигонов: {len(polygons)}")
        
        # Создаем стены
        for i, poly in enumerate(polygons):
            wall_mesh = self.create_extruded_wall(poly)
            if wall_mesh is not None:
                meshes.append(wall_mesh)
        
        print(f"  Создано мешей стен: {len(meshes)}")
        
        # Размеры этажа в метрах
        floor_width = image_width / self.pixels_per_meter
        floor_depth = image_height / self.pixels_per_meter
        
        # Добавляем пол
        if include_floor:
            floor_mesh = self.create_floor_mesh(floor_width, floor_depth, 0)
            meshes.append(floor_mesh)
        
        # Добавляем потолок
        if include_ceiling:
            ceiling = self.create_floor_mesh(
                floor_width, 
                floor_depth, 
                self.floor_height
            )
            meshes.append(ceiling)
        
        if not meshes:
            print("Предупреждение: не удалось создать меши")
            return None
        
        # Объединяем все меши
        combined = trimesh.util.concatenate(meshes)
        
        # Поворачиваем модель: Z-up -> Y-up (горизонтальная плоскость)
        try:
            # -90 градусов вокруг X
            matrix = trimesh.transformations.rotation_matrix(-np.pi/2, [1, 0, 0])
            combined.apply_transform(matrix)
        except Exception as e:
            print(f"  Warning: Orientation rotation failed: {e}")
            
        print(f"  Вершин: {len(combined.vertices)}")
        print(f"  Граней: {len(combined.faces)}")
        
        return combined
    
    def export_mesh(
        self,
        mesh: 'trimesh.Trimesh',
        name: str,
        formats: List[str] = None
    ) -> MeshExportResult:
        """
        Экспорт меша в различные форматы
        
        Args:
            mesh: Trimesh объект
            name: Имя файла (без расширения)
            formats: Список форматов ['obj', 'glb', 'stl']
            
        Returns:
            MeshExportResult с путями к файлам
        """
        if formats is None:
            formats = ['obj', 'glb']
        
        self._mesh_id += 1
        result = MeshExportResult(
            mesh_id=self._mesh_id,
            obj_path=None,
            glb_path=None,
            stl_path=None,
            vertices_count=len(mesh.vertices),
            faces_count=len(mesh.faces)
        )
        
        for fmt in formats:
            output_path = os.path.join(self.output_dir, f"{name}.{fmt}")
            
            try:
                mesh.export(output_path, file_type=fmt)
                print(f"  Экспорт {fmt.upper()}: {output_path}")
                
                if fmt == 'obj':
                    result.obj_path = output_path
                elif fmt == 'glb':
                    result.glb_path = output_path
                elif fmt == 'stl':
                    result.stl_path = output_path
            except Exception as e:
                print(f"  Ошибка экспорта {fmt}: {e}")
        
        return result
    
    def process_plan_image(
        self,
        mask_image: np.ndarray,
        name: str = "floor",
        floor_number: int = 1
    ) -> Optional[MeshExportResult]:
        """
        Полный pipeline обработки плана
        
        Args:
            mask_image: Бинарная маска (белый = стены)
            name: Имя выходного файла
            floor_number: Номер этажа
            
        Returns:
            MeshExportResult или None
        """
        import cv2
        
        # Находим контуры
        contours, _ = cv2.findContours(
            mask_image.copy(),
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        # Фильтруем слишком маленькие контуры
        min_area = 500
        filtered_contours = [
            c for c in contours 
            if cv2.contourArea(c) > min_area
        ]
        
        print(f"Контуров после фильтрации: {len(filtered_contours)}")
        
        if not filtered_contours:
            print("Ошибка: не найдены контуры стен")
            return None
        
        # Генерируем 3D модель
        mesh = self.generate_floor_model(
            filtered_contours,
            mask_image.shape[1],
            mask_image.shape[0],
            floor_number
        )
        
        if mesh is None:
            return None
        
        # Экспортируем
        result = self.export_mesh(mesh, name)
        
        return result


# Для тестирования
if __name__ == "__main__":
    import sys
    import cv2
    from binarization import BinarizationService
    
    if len(sys.argv) < 2:
        print("Usage: python mesh_generator.py <image_path>")
        sys.exit(1)
    
    # Бинаризация
    print("=== Шаг 1: Бинаризация ===")
    bin_service = BinarizationService()
    mask, threshold, mask_path = bin_service.process(sys.argv[1])
    
    # Генерация 3D
    print("\n=== Шаг 2: Генерация 3D ===")
    mesh_service = MeshGeneratorService()
    
    # Получаем имя файла
    import os
    filename = os.path.basename(sys.argv[1])
    name = os.path.splitext(filename)[0]
    
    result = mesh_service.process_plan_image(mask, name)
    
    if result:
        print(f"\n=== Результат ===")
        print(f"ID: {result.mesh_id}")
        print(f"Вершин: {result.vertices_count}")
        print(f"Граней: {result.faces_count}")
        print(f"OBJ: {result.obj_path}")
        print(f"GLB: {result.glb_path}")
