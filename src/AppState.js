export const AppState = {
    mode: 'ERASE', 
    selectionAction: 'ERASE', 

    paintColor: [255, 200, 0, 255], 
    paintOpacity: 0.5,
    brushRotationOffset: 0,
    isProcessing: false,     

    loadedScenes: [],        
    activeLayerIndex: -1,    
    
    selectedLayerIndices: [], 
    groupProxy: null,         
    groupOffsets: new Map(),  

    activeSplatMesh: null,
    splatBuffer: null,
    erasedIndices: new Set(),
    currentPaintStroke: new Map(), 

    history: [],              
    currentEraseStroke: [],   
    
    isPresentationMode: false,
    markers: [],             
    waypoints: [],           
    currentWaypointIndex: -1,
};