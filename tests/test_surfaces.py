"""Coplanar material precedence and internal interface removal."""

import unittest

import numpy as np

from kernel_voxel.surfaces import resolve_coplanar


class SurfaceTests(unittest.TestCase):
    def test_partial_overlap_has_one_exterior_and_preserves_material_priority(self):
        vertices = [
            (0, 0, 0),
            (2, 0, 0),
            (2, 2, 0),
            (0, 2, 0),
            (1, 1, 0),
            (3, 1, 0),
            (3, 3, 0),
            (1, 3, 0),
        ]
        points, faces, materials = resolve_coplanar(
            vertices, [(0, 1, 2, 3), (4, 5, 6, 7)], [0, 1]
        )
        areas = [0.0, 0.0]
        for face, material in zip(faces, materials):
            quad = np.array([points[i] for i in face])
            cross = np.cross(quad[1] - quad[0], quad[3] - quad[0])
            self.assertGreater(cross[2], 0)
            areas[material] += np.linalg.norm(cross)
        self.assertEqual(areas, [3, 4])

    def test_opposite_faces_cancel_only_the_shared_area(self):
        points, faces, _ = resolve_coplanar(
            [
                (0, 0, 0),
                (2, 0, 0),
                (2, 1, 0),
                (0, 1, 0),
                (1, 0, 0),
                (1, 1, 0),
                (3, 1, 0),
                (3, 0, 0),
            ],
            [(0, 1, 2, 3), (4, 5, 6, 7)],
            [0, 1],
        )
        area = 0
        for face in faces:
            quad = np.array([points[i] for i in face])
            area += np.linalg.norm(np.cross(quad[1] - quad[0], quad[3] - quad[0]))
        self.assertEqual(area, 2)
