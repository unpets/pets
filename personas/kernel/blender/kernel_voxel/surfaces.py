"""Resolve overlapping axis-aligned faces without changing the voxel silhouette."""

from collections import defaultdict

import numpy as np


def resolve_coplanar(vertices, faces, materials):
    planes = defaultdict(list)
    for face, material in zip(faces, materials):
        points = np.round(np.asarray([vertices[i] for i in face]), 7)
        normal = np.cross(points[1] - points[0], points[2] - points[0])
        axis = int(np.argmax(np.abs(normal)))
        axes = [(axis + 1) % 3, (axis + 2) % 3]
        uv = points[:, axes]
        planes[axis, float(points[0, axis])].append(
            (uv.min(axis=0), uv.max(axis=0), int(np.sign(normal[axis])), material)
        )
    result_vertices, result_faces, result_materials = [], [], []
    for (axis, coordinate), rectangles in planes.items():
        axes = [(axis + 1) % 3, (axis + 2) % 3]
        u = np.unique([v[0] for lo, hi, _, _ in rectangles for v in (lo, hi)])
        v = np.unique([p[1] for lo, hi, _, _ in rectangles for p in (lo, hi)])
        positive = np.full((len(u) - 1, len(v) - 1), -1, dtype=np.int16)
        negative = np.full_like(positive, -1)
        for lo, hi, sign, material in rectangles:
            a, b = np.searchsorted(u, [lo[0], hi[0]])
            c, d = np.searchsorted(v, [lo[1], hi[1]])
            (positive if sign > 0 else negative)[a:b, c:d] = material
        shared = (positive >= 0) & (negative >= 0)
        positive[shared] = negative[shared] = -1
        for sign, layer in ((1, positive), (-1, negative)):
            for i in range(len(u) - 1):
                j = 0
                while j < len(v) - 1:
                    material = int(layer[i, j])
                    end = j + 1
                    while end < len(v) - 1 and layer[i, end] == material:
                        end += 1
                    if material >= 0:
                        quad = np.zeros((4, 3))
                        quad[:, axis] = coordinate
                        quad[:, axes] = [
                            (u[i], v[j]),
                            (u[i + 1], v[j]),
                            (u[i + 1], v[end]),
                            (u[i], v[end]),
                        ]
                        if sign < 0:
                            quad = quad[::-1]
                        offset = len(result_vertices)
                        result_vertices.extend(quad)
                        result_faces.append(tuple(range(offset, offset + 4)))
                        result_materials.append(material)
                    j = end
    return result_vertices, result_faces, result_materials
