import pytest
import numpy as np
import cv2


@pytest.fixture
def blank_white_image() -> np.ndarray:
    return np.ones((200, 200, 3), dtype=np.uint8) * 255


@pytest.fixture
def simple_room_image() -> np.ndarray:
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 20), (180, 180), (0, 0, 0), thickness=5)
    return img


@pytest.fixture
def binary_rectangle_mask() -> np.ndarray:
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.rectangle(mask, (20, 20), (180, 180), 255, thickness=5)
    return mask


@pytest.fixture
def empty_mask() -> np.ndarray:
    return np.zeros((200, 200), dtype=np.uint8)
