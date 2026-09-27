"""Fine voxel surface meshes. No bevel modifiers, smooth normals, outlines or halos."""
import math
from collections import defaultdict
import numpy as np
import bpy
from mathutils import Matrix, Vector
from .rig import pose_for, cable_points
from .screen import framebuffer

VOXEL=.035
PALETTE={'shell':'586777','top':'718394','dark':'303d4c','joint':'202b38',
         'metal':'9baeb8','violet':'ae77df','violet_dim':'705286',
         'cyan':'55e9eb','cyan_dim':'347888','screen':'07151d','green':'6bf1a0'}

def srgb(v):return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4

def material(name,hexcode,variation=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    rgb=[max(0,min(1,int(hexcode[i:i+2],16)/255+variation)) for i in (0,2,4)]
    linear=tuple(srgb(v) for v in rgb)
    p.inputs['Base Color'].default_value=(*linear,1)
    p.inputs['Metallic'].default_value=.34 if name.startswith(('metal','shell','top')) else .12
    p.inputs['Roughness'].default_value=.48
    if name.startswith(('cyan','green')):
        p.inputs['Emission Color'].default_value=(*linear,1);p.inputs['Emission Strength'].default_value=.50
    m.diffuse_color=(*linear,1)
    return m

# Consistent outward winding for +/- X,Y,Z.
DIRECTIONS=[((1,0,0),((1,0,0),(1,1,0),(1,1,1),(1,0,1))),
 ((-1,0,0),((0,0,0),(0,0,1),(0,1,1),(0,1,0))),
 ((0,1,0),((0,1,0),(0,1,1),(1,1,1),(1,1,0))),
 ((0,-1,0),((0,0,0),(1,0,0),(1,0,1),(0,0,1))),
 ((0,0,1),((0,0,1),(1,0,1),(1,1,1),(0,1,1))),
 ((0,0,-1),((0,0,0),(0,1,0),(1,1,0),(1,0,0)))]

class Builder:
    def __init__(self):
        self.buffers=defaultdict(lambda:[[],[],[]])
        self.palette=[];self.matidx={};self.voxels=0
        for name,col in PALETTE.items():
            for variant in range(3):
                self.matidx[(name,variant)]=len(self.palette)
                self.palette.append(material(f'{name}.{variant}',col,(variant-1)*.009))
    def face(self,part,points,color,variant=1):
        vertices,faces,mats=self.buffers[part];n=len(vertices)
        vertices.extend(points);faces.append(tuple(range(n,n+len(points))));mats.append(self.matidx[(color,variant)])
    def box(self,part,center,size,color):
        origin=np.array(center)-np.array(size)/2
        for _,corners in DIRECTIONS:
            self.face(part,[origin+np.array(c)*size for c in corners],color)
    def voxel(self,part,center,size,color,radius=.08,step=VOXEL,cut=None,shape='box'):
        count=np.ceil(np.array(size)/step).astype(int)
        origin=np.array(center)-count*step/2
        occupied=set()
        half=np.array(size)/2
        for i in np.ndindex(*count):
            p=origin+(np.array(i)+.5)*step-np.array(center)
            if shape=='motor':
                inside=abs(p[0])<=half[0] and (p[1]/half[1])**2+(p[2]/half[2])**2<=1
            else:
                q=np.abs(p)-(half-radius)
                sdf=np.linalg.norm(np.maximum(q,0))+min(max(q),0)-radius
                inside=sdf<=0
            if inside and not (cut and cut(p+np.array(center))):occupied.add(i)
        self.voxels+=len(occupied)
        for i in sorted(occupied):
            v=(i[0]*13+i[1]*7+i[2]*3)%13
            variant=0 if v==0 else 2 if v==1 else 1
            for delta,corners in DIRECTIONS:
                if tuple(i[k]+delta[k] for k in range(3)) not in occupied:
                    self.face(part,[origin+(np.array(i)+c)*step for c in corners],color,variant)
    def finish(self):
        nodes={}
        for name,(verts,faces,mats) in self.buffers.items():
            mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
            for m in self.palette:mesh.materials.append(m)
            mesh.polygons.foreach_set('material_index',mats)
            obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
            obj['rig_part']=name
            nodes[name]=obj
        return nodes

def build_model():
    b=Builder()
    b.voxel('body',(0,0,1.44),(1.04,.68,.39),'shell',.14)
    b.voxel('body',(0,0,1.15),(.91,.63,.19),'dark',.07)
    b.voxel('body',(0,0,.95),(.79,.58,.20),'shell',.07)
    b.box('body',(0,-.327,1.20),(.70,.018,.034),'violet')
    b.box('body',(0,-.330,1.105),(.62,.019,.025),'violet_dim')
    b.voxel('body',(0,0,1.735),(.24,.27,.19),'metal',.04,step=.022)
    for z in (1.68,1.73,1.78):b.box('body',(0,0,z),(.28,.30,.025),'joint')
    # Flush chest processor hatch, contacts, vents and fasteners.
    b.voxel('body',(0,-.345,1.44),(.36,.07,.27),'joint',.035,step=.025)
    b.box('body',(0,-.389,1.44),(.20,.023,.12),'violet_dim')
    b.box('body',(0,-.404,1.44),(.10,.012,.09),'cyan')
    for side in (-1,1):
        for i in range(4):b.box('body',(side*(.26+i*.045),-.348,1.45),(.020,.015,.10),'joint')
        for z in (1.32,1.57):b.box('body',(side*.36,-.326,z),(.030,.025,.030),'metal')
        b.box('body',(side*.365,0,.95),(.03,.25,.07),'violet_dim')
    # Rounded contours are sampled on a fine cubic lattice, never chamfered.
    b.voxel('head',(0,0,.33),(1.47,.95,.97),'shell',.22,
            cut=lambda p: abs(p[0])<.597 and abs(p[2]-.33)<.334 and p[1]<-.26)
    # Deep cavity backing and four rails around the same aperture.
    b.box('head',(0,-.273,.33),(1.20,.026,.68),'screen')
    for side in (-1,1):
        b.box('head',(side*.605,-.392,.33),(.034,.15,.65),'joint')
        b.box('head',(0,-.392,.33+side*.331),(1.22,.15,.025),'joint')
        b.voxel('head',(side*.747,.04,.32),(.13,.40,.35),'violet_dim',.06,step=.026)
        b.voxel('head',(side*.82,.035,.32),(.044,.24,.24),'metal',.02,step=.018,shape='motor')
        b.box('head',(side*.845,-.01,.32),(.025,.08,.095),'cyan')
        for y in (.07,.17,.27):b.box('head',(side*.713,y,.56),(.03,.034,.13),'joint')
        b.box('head',(side*.50,-.372,-.079),(.10,.033,.025),'cyan_dim')
        for z in (.02,.64):b.box('head',(side*.633,-.380,z),(.023,.027,.025),'metal')
    b.box('head',(0,.02,.827),(.15,.18,.039),'joint')
    b.box('head',(0,.02,.861),(.105,.13,.028),'cyan')
    # Crisp narrow seams across the crown and service hatch at the back.
    b.box('head',(0,.452,.32),(.69,.016,.40),'dark')
    for z in (.22,.31,.40):b.box('head',(0,.466,z),(.49,.014,.028),'joint')
    for side in (-1,1):
        n='L' if side<0 else 'R'
        for part,length,width in [(f'thigh.{n}',.42,.235),(f'shin.{n}',.42,.22),
                                  (f'upper_arm.{n}',.33,.205),(f'forearm.{n}',.34,.215)]:
            b.voxel(part,(0,0,length*.50),(width,.23,length-.14),'shell',.045,step=.025)
            b.box(part,(0,-.124,length*.50),(width*.50,.025,.033),'cyan_dim')
            b.voxel(part,(0,0,0),(.25,.20,.20),'joint',.035,step=.020,shape='motor')
            for side2 in (-1,1):
                b.voxel(part,(side2*.132,0,0),(.025,.122,.122),'metal',.0,step=.017,shape='motor')
                b.box(part,(side2*.147,0,0),(.015,.036,.037),'violet_dim')
            b.box(part,(0,.095,length*.48),(.085,.052,length*.56),'dark')
        b.voxel(f'hand.{n}',(0,0,.055),(.21,.15,.135),'dark',.025,step=.020)
        b.box(f'hand.{n}',(0,-.085,.055),(.12,.026,.060),'violet')
        for x in (-.065,0,.065):
            b.box(f'hand.{n}',(x,0,.145),(.05,.105,.060),'metal')
            b.box(f'hand.{n}',(x,-.018,.198),(.05,.07,.055),'shell')
        b.box(f'hand.{n}',(-side*.13,-.012,.08),(.07,.085,.055),'metal')
        b.voxel(f'foot.{n}',(0,-.09,-.075),(.37,.54,.18),'dark',.05,step=.025)
        b.voxel(f'foot.{n}',(0,-.10,-.01),(.30,.41,.11),'shell',.04,step=.025)
        b.box(f'foot.{n}',(0,-.351,-.075),(.22,.015,.034),'cyan_dim')
        for x in (-.10,0,.10):b.box(f'foot.{n}',(x,-.10,-.15),(.06,.38,.025),'joint')
    # Small three-bay server: work-state-only and attached by a real cable.
    b.voxel('server',(1.18,.0,.51),(.47,.65,.99),'dark',.055,step=.025)
    for z in (.22,.44,.66):
        b.box('server',(1.18,-.337,z),(.375,.035,.17),'joint')
        for j in range(5):b.box('server',(1.045+j*.047,-.360,z),(.020,.019,.10),'shell')
        b.box('server',(1.337,-.362,z+.03),(.030,.017,.023),'green')
    b.box('server',(1.185,-.360,.85),(.15,.025,.11),'screen')
    b.box('server',(1.185,-.379,.70),(.074,.026,.074),'metal')
    b.box('server',(1.185,-.4,.70),(.043,.025,.043),'cyan')
    b.box('hand.R',(.122,0,.035),(.055,.088,.084),'metal')
    b.box('server',(1.18,-.01,1.017),(.36,.52,.025),'shell')
    nodes=b.finish()
    # One screen plane with one local transform, packed texture and UVs.
    mesh=bpy.data.meshes.new('display')
    w,h=1.095,.600;y=-.408;z=.32
    mesh.from_pydata([(-w/2,y,z-h/2),(w/2,y,z-h/2),(w/2,y,z+h/2),(-w/2,y,z+h/2)],[],[(0,1,2,3)])
    uv=mesh.uv_layers.new(name='ScreenUV')
    for loop,v in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=v
    display=bpy.data.objects.new('display',mesh);bpy.context.collection.objects.link(display);display.parent=nodes['head'];display['is_display']=True
    tex=bpy.data.images.new('Kernel deterministic framebuffer',width=96,height=64,alpha=True)
    tex.colorspace_settings.name='sRGB'
    mat=bpy.data.materials.new('display');mat.use_nodes=True
    nt=mat.node_tree;nt.nodes.clear()
    output=nt.nodes.new('ShaderNodeOutputMaterial');em=nt.nodes.new('ShaderNodeEmission');img=nt.nodes.new('ShaderNodeTexImage');img.image=tex;img.interpolation='Closest'
    em.inputs['Strength'].default_value=.95;nt.links.new(img.outputs['Color'],em.inputs['Color']);nt.links.new(em.outputs[0],output.inputs[0]);mesh.materials.append(mat)
    # The cable is geometry, with physical wrist and server anchors.
    curve=bpy.data.curves.new('cable','CURVE');curve.dimensions='3D';curve.resolution_u=1;curve.bevel_depth=.025;curve.bevel_resolution=1;curve.resolution_u=1
    spline=curve.splines.new('POLY');spline.points.add(31)
    cable=bpy.data.objects.new('cable',curve);bpy.context.collection.objects.link(cable);curve.materials.append(b.palette[b.matidx[('cyan_dim',1)]])
    scene={'nodes':nodes,'display':display,'texture':tex,'cable':cable,'voxel_count':b.voxels}
    apply_pose(scene,pose_for('idle',0))
    return scene

def apply_pose(model,pose):
    for name,m in pose.matrices.items():model['nodes'][name].matrix_world=Matrix(m.tolist())
    work=pose.state=='running'
    model['nodes']['server'].hide_render=not work;model['nodes']['server'].hide_viewport=not work
    model['cable'].hide_render=not work;model['cable'].hide_viewport=not work
    for p,v in zip(model['cable'].data.splines[0].points,cable_points(pose)):p.co=(*v,1)
    im=np.asarray(framebuffer(pose.state,pose.t,pose.gaze).convert('RGBA'),dtype=np.float32)/255
    model['texture'].pixels.foreach_set(np.flipud(im).flatten());model['texture'].update()
    bpy.context.view_layer.update()


def setup_scene(scale=4,samples=32):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
    scene.cycles.samples=samples;scene.cycles.seed=17;scene.cycles.use_animated_seed=False
    scene.cycles.use_denoising=True;scene.cycles.max_bounces=4
    scene.render.threads_mode='FIXED';scene.render.threads=8
    scene.render.resolution_x=192*scale;scene.render.resolution_y=208*scale;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8'
    scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    world=bpy.data.worlds.new('Soft studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.23,.30,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
    target=Vector((.06,0,1.47));bpy.ops.object.camera_add(location=target+Vector((2.2,-10,3.8)))
    cam=bpy.context.object;cam.name='Pet camera';cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.43;scene.camera=cam
    for name,loc,power,size,color in [('Key',(-3,-4,7),450,4.0,(.87,.94,1)),('Fill',(4,-2,4),220,3.5,(.76,.88,1)),('Top',(-1,3,6),320,3.0,(.87,.79,1))]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,1.4))-o.location).to_track_quat('-Z','Y').to_euler()
    return scene
