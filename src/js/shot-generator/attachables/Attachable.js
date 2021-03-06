const THREE = require('three')
window.THREE = window.THREE || THREE

const React = require('react')
const { useRef, useEffect, useState } = React
const ObjectRotationControl = require("../../shared/IK/objects/ObjectRotationControl")
require("../../shared/IK/utils/jsUtils")
// return a group which can report intersections
const groupFactory = () => {
    let group = new THREE.Group()
    group.raycast = function ( raycaster, intersects ) {
      let results = raycaster.intersectObjects(this.children)
      if (results.length) {
        // distance – distance between the origin of the ray and the intersection
        // point – point of intersection, in world coordinates
        // face – intersected face
        // faceIndex – index of the intersected face
        // object – the intersected object
        // uv - U,V coordinates at point of intersection
        intersects.push({ object: this })
      }
    }
    return group
}

const materialFactory = () => new THREE.MeshToonMaterial({
    color: 0xcccccc,
    emissive: 0x0,
    specular: 0x0,
    shininess: 0,
    flatShading: false
})
  
const meshFactory = originalMesh => {
  let mesh = originalMesh.clone()

  // create a skeleton if one is not provided
  if (mesh instanceof THREE.SkinnedMesh && !mesh.skeleton) {
    mesh.skeleton = new THREE.Skeleton()
  }

  let material = materialFactory()

  if (mesh.material.map) {
    material.map = mesh.material.map
    material.map.needsUpdate = true
  }
  mesh.material = material

  return mesh
}

const Attachable = React.memo(({ scene, id, updateObject, sceneObject, loaded, modelData, camera, largeRenderer, isSelected, deleteObjects, ...props }) => {
  const container = useRef()
  const characterObject = useRef()
  const objectRotationControl = useRef();
  const [ready, setReady] = useState(false) // ready to load?
  const [needsInitialization, setInitialization] = useState(false)
  const setLoaded = loaded => updateObject(id, { loaded })
  const domElement = useRef()
  const isBoneSelected = useRef()
  useEffect(() => {
      container.current = groupFactory()
      container.current.userData.id = id
      container.current.userData.type = props.type

      container.current.userData.type = 'attachable'
      container.current.userData.bindedId = props.attachToId
      container.current.userData.isRotationEnabled = false
      container.current.rebindAttachable = rebindAttachable
      container.current.saveToStore = saveToStore
      isBoneSelected.current = false
      return function cleanup () {
        setReady(false)
        setLoaded(false)
        if(container.current.parent)
          container.current.parent.remove(container.current)
        if( characterObject.current) {
          characterObject.current.attachables.remove(container.current)
          characterObject.current = null
        }
   
        objectRotationControl.current = null
        container.current = null
      }
  }, [])    

  useEffect(() => {
    setReady(false)
    setLoaded(false)
  }, [props.model])

  useEffect(() => {
    if (needsInitialization && !loaded) {

      characterObject.current = scene.children.filter(child => child.userData.id === props.attachToId)[0]
      if(!characterObject.current) {
        setReady(false)
        setInitialization(false)
        return
      }  
      container.current.remove(...container.current.children)
      let isSkinnedMesh = false
      // Traverses passed model and clones it's meshes to container
      try {
        // add a clone of every single mesh we find
        modelData.scene.traverse( function ( child ) {
          if ( child instanceof THREE.Mesh ) {
            if(child.type === "SkinnedMesh") isSkinnedMesh = true
            let newMesh = meshFactory(child)
            newMesh.geometry.computeBoundingSphere()
            newMesh.position.copy(newMesh.geometry.boundingSphere.center)
            newMesh.position.negate()
            container.current.add(newMesh)
            newMesh.userData.type = 'attachable'
            newMesh.layers.disable(0)
            newMesh.layers.enable(1)
            newMesh.layers.disable(2)
            newMesh.layers.enable(3)
          }
        })
        } catch (err) {
      }
      if(isSkinnedMesh) {
        deleteObjects([id])
      }
      // Sets up bind bone
      let skinnedMesh = characterObject.current.getObjectByProperty("type", "SkinnedMesh")
      let skeleton = skinnedMesh.skeleton
      let bone = skeleton.getBoneByName(props.bindBone)
      domElement.current = largeRenderer.current.domElement
      container.current.userData.bindBone = props.bindBone

      // Applies character scale for case when character is scaled up to 100
      let scale = props.size / characterObject.current.scale.x
      container.current.scale.set(scale, scale, scale)
      bone.add(container.current)
      container.current.updateMatrixWorld(true, true)
      // Adds a container of attachable to character if it doesn't exist and adds current attachable
      if(!characterObject.current.attachables) {
        characterObject.current.attachables = []
        characterObject.current.attachables.push(container.current)
      } else {
        let isAdded = characterObject.current.attachables.some(attachable => attachable.uuid === container.current.uuid)
        if(!isAdded) {
          characterObject.current.attachables.push(container.current)
        }
      }

      // Sets up object rotation control for manipulation of attachale rotation
      objectRotationControl.current = new ObjectRotationControl(scene, camera, domElement.current, characterObject.current.uuid)
      objectRotationControl.current.control.canSwitch = false
      objectRotationControl.current.setUpdateCharacter((name, rotation) => {
      let euler = new THREE.Euler().setFromQuaternion(container.current.worldQuaternion())

      updateObject(container.current.userData.id, {
        rotation:
        {
          x : euler.x,
          y : euler.y,
          z : euler.z,
        }
      } )})
      setReady(true)
    }
  }, [ready, characterObject.current, needsInitialization])


  useEffect(() => {
    if ( !ready ) return
    if ( !characterObject.current ) return
    // Applies position to container.
    // Position for container should always be in world space but container always attached to bone
    // We need to take it out of bone space and apply world position
    characterObject.current.updateWorldMatrix(true, true)
    container.current.parent.updateMatrixWorld(true)
    let parentMatrixWorld = container.current.parent.matrixWorld
    let parentInverseMatrixWorld = container.current.parent.getInverseMatrixWorld()
    container.current.applyMatrix(parentMatrixWorld)
    container.current.position.set(props.x, props.y, props.z)
    container.current.updateMatrixWorld(true)
    container.current.applyMatrix(parentInverseMatrixWorld)
    container.current.updateMatrixWorld(true)
  }, [props.x, props.y, props.z, ready, characterObject.current])

  useEffect(() => {
    if ( !ready ) return
    if ( !props.rotation ) return
    if ( !characterObject.current ) return
    characterObject.current.updateWorldMatrix(true, true)
    let parentMatrixWorld = container.current.parent.matrixWorld
    let parentInverseMatrixWorld = container.current.parent.getInverseMatrixWorld()

    container.current.applyMatrix(parentMatrixWorld)
    container.current.rotation.set(props.rotation.x, props.rotation.y, props.rotation.z)
    container.current.updateMatrixWorld(true)
    container.current.applyMatrix(parentInverseMatrixWorld)
    container.current.updateMatrixWorld(true)
  }, [props.rotation, ready, characterObject.current])
    
  useEffect(() => {
    if(!ready) return
    if ( !characterObject.current ) return
      let outlineParameters = {}
      if(isSelected) {
        window.addEventListener("keydown", keyDownEvent, false)
        if(!isBoneSelected.current) {
          if(objectRotationControl.current.isEnabled) { 
            objectRotationControl.current.selectObject(container.current, props.id)
          }
          isBoneSelected.current = true
        }

        outlineParameters = {
          thickness: 0.008,
          color: [ 122/256.0/2, 114/256.0/2, 233/256.0/2 ]
        }
      }
      else {
        if(isBoneSelected.current) {
          objectRotationControl.current.deselectObject()
          isBoneSelected.current = false
        }
        outlineParameters = {
          thickness: 0.008,
          color: [ 0, 0, 0 ]
        }
      }
      container.current.children[0].material.userData.outlineParameters = outlineParameters
      return function cleanup () {
        window.removeEventListener("keydown", keyDownEvent, false)
      }
  }, [isSelected, ready])

  useEffect(() => {
    if (ready ) {
      setLoaded(true)
    }
  }, [ready])

  useEffect(() => {
    let character = scene.children.filter(child => child.userData.id === props.attachToId)[0]
    if(character && modelData) {
      setInitialization(true)
    } else {
      setReady(false)
      setInitialization(false)
    }
    
  }, [modelData, scene.children.length, characterObject.current, needsInitialization ])

  useEffect(() => {
    if(!ready) return
    if(!objectRotationControl.current) return
    objectRotationControl.current.setCamera(camera)
  }, [ready, camera])

  useEffect(() => {
    if(!ready) return
    if(! container.current) return
    container.current.userData.bindBone = props.bindBone
  }, [props.bindBone])

  useEffect(() => {
    if(!ready) return
    if(!characterObject.current) return
    let scale = container.current.parent.uuid === scene.uuid ? props.size : props.size / characterObject.current.scale.x
    container.current.scale.set( scale, scale, scale )
  }, [props.size, characterObject.current])

  const rebindAttachable = (characterScale) => {
    if(!container.current) return

    let prevCharacter = characterObject.current
    characterObject.current = scene.children.filter(child => child.userData.id === props.attachToId)[0]
    characterObject.current.updateMatrixWorld(true, true)
    let skinnedMesh = characterObject.current.getObjectByProperty("type", "SkinnedMesh")
    let skeleton = skinnedMesh.skeleton
    let bone = skeleton.getBoneByName(props.bindBone)
    domElement.current = largeRenderer.current.domElement
    container.current.userData.bindBone = props.bindBone
    prevCharacter.updateMatrixWorld(true)
    prevCharacter.updateWorldMatrix(true, true)
    let prevParent = container.current.parent
    prevCharacter.attachables.remove(container.current)
    
    prevParent.remove(container.current)
    container.current.applyMatrix(prevCharacter.matrixWorld)
    container.current.applyMatrix(characterObject.current.getInverseMatrixWorld())
    bone.add(container.current)
    container.current.scale.set( props.size, props.size, props.size )
    container.current.scale.multiplyScalar(1 / characterScale)
    container.current.updateWorldMatrix(true, true)

    // Adds a container of attachable to character if it doesn't exist and adds current attachable
    if(!characterObject.current.attachables) {
      characterObject.current.attachables = []
      characterObject.current.attachables.push(container.current)
    } else {
      let isAdded = characterObject.current.attachables.some(attachable => attachable.uuid === container.current.uuid)
      if(!isAdded) {
        characterObject.current.attachables.push(container.current)
      }
    }
    let position = container.current.worldPosition() 
    updateObject(id, { x: position.x, y: position.y, z: position.z})
  }

  const saveToStore = () => {
    let position = container.current.worldPosition() 
    let quaternion = container.current.worldQuaternion()
    let matrix = container.current.matrix.clone()
    matrix.premultiply(container.current.parent.matrixWorld)
    matrix.decompose(position, quaternion, new THREE.Vector3())
    let euler = new THREE.Euler().setFromQuaternion(quaternion)
    updateObject(id, { x: position.x, y: position.y, z: position.z, rotation: {x: euler.x, y: euler.y, z: euler.z}})
  }

  const keyDownEvent = (event) => { switchManipulationState(event) }

  const switchManipulationState = (event) => {
    if(event.ctrlKey ) {
      if(event.key === 'r') {
            event.stopPropagation()
            let isRotation = !container.current.userData.isRotationEnabled
            container.current.userData.isRotationEnabled = isRotation
            if(isRotation) {
              objectRotationControl.current.selectObject(container.current, props.id)
              objectRotationControl.current.isEnabled = true
            } else {
              objectRotationControl.current.deselectObject()
              objectRotationControl.current.isEnabled = false
            }
        }
    } 
  }
})

module.exports = Attachable
