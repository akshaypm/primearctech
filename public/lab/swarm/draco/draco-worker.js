/* Same-origin Draco worker. The site CSP blocks blob workers, so this file is served from /lab/swarm/draco/. */
importScripts("/lab/swarm/draco/draco_wasm_wrapper.js");

let decoderPending;

onmessage = function (event) {
  const message = event.data;
  switch (message.type) {
    case "init":
      decoderPending = new Promise(function (resolve, reject) {
        const config = {
          locateFile: function () {
            return "/lab/swarm/draco/draco_decoder.wasm";
          },
          onModuleLoaded: function (draco) {
            resolve(draco);
          },
        };
        try {
          DracoDecoderModule(config);
        } catch (error) {
          reject(error);
        }
      });
      break;
    case "decode":
      decoderPending
        .then(function (draco) {
          const decoder = new draco.Decoder();
          try {
            const geometry = decodeGeometry(draco, decoder, new Int8Array(message.buffer), message.taskConfig);
            const buffers = geometry.attributes.map(function (attr) {
              return attr.array.buffer;
            });
            if (geometry.index) buffers.push(geometry.index.array.buffer);
            self.postMessage({ type: "decode", id: message.id, geometry: geometry }, buffers);
          } catch (error) {
            self.postMessage({ type: "error", id: message.id, error: error.message });
          } finally {
            draco.destroy(decoder);
          }
        })
        .catch(function (error) {
          self.postMessage({ type: "error", id: message.id, error: String(error && error.message ? error.message : error) });
        });
      break;
    default:
      break;
  }
};

function decodeGeometry(draco, decoder, array, taskConfig) {
  const attributeIDs = taskConfig.attributeIDs;
  const attributeTypes = taskConfig.attributeTypes;
  let dracoGeometry;
  let decodingStatus;
  const geometryType = decoder.GetEncodedGeometryType(array);
  if (geometryType === draco.TRIANGULAR_MESH) {
    dracoGeometry = new draco.Mesh();
    decodingStatus = decoder.DecodeArrayToMesh(array, array.byteLength, dracoGeometry);
  } else if (geometryType === draco.POINT_CLOUD) {
    dracoGeometry = new draco.PointCloud();
    decodingStatus = decoder.DecodeArrayToPointCloud(array, array.byteLength, dracoGeometry);
  } else {
    throw new Error("THREE.DRACOLoader: Unexpected geometry type.");
  }
  if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
    throw new Error("THREE.DRACOLoader: Decoding failed: " + decodingStatus.error_msg());
  }
  const geometry = { index: null, attributes: [] };
  for (const attributeName in attributeIDs) {
    const attributeType = self[attributeTypes[attributeName]];
    let attribute;
    let attributeID;
    if (taskConfig.useUniqueIDs) {
      attributeID = attributeIDs[attributeName];
      attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID);
    } else {
      attributeID = decoder.GetAttributeId(dracoGeometry, draco[attributeIDs[attributeName]]);
      if (attributeID === -1) continue;
      attribute = decoder.GetAttribute(dracoGeometry, attributeID);
    }
    const attributeResult = decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute);
    if (attributeName === "color") attributeResult.vertexColorSpace = taskConfig.vertexColorSpace;
    geometry.attributes.push(attributeResult);
  }
  if (geometryType === draco.TRIANGULAR_MESH) geometry.index = decodeIndex(draco, decoder, dracoGeometry);
  draco.destroy(dracoGeometry);
  return geometry;
}

function decodeIndex(draco, decoder, dracoGeometry) {
  const numFaces = dracoGeometry.num_faces();
  const numIndices = numFaces * 3;
  const byteLength = numIndices * 4;
  const ptr = draco._malloc(byteLength);
  decoder.GetTrianglesUInt32Array(dracoGeometry, byteLength, ptr);
  const index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice();
  draco._free(ptr);
  return { array: index, itemSize: 1 };
}

function decodeAttribute(draco, decoder, dracoGeometry, attributeName, TypedArray, attribute) {
  const count = dracoGeometry.num_points();
  const itemSize = attribute.num_components();
  const dracoDataType = getDracoDataType(draco, TypedArray);
  const srcByteStride = itemSize * TypedArray.BYTES_PER_ELEMENT;
  const dstByteStride = Math.ceil(srcByteStride / 4) * 4;
  const dstStride = dstByteStride / TypedArray.BYTES_PER_ELEMENT;
  const srcByteLength = count * srcByteStride;
  const dstByteLength = count * dstByteStride;
  const ptr = draco._malloc(srcByteLength);
  decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, dracoDataType, srcByteLength, ptr);
  const srcArray = new TypedArray(draco.HEAPF32.buffer, ptr, srcByteLength / TypedArray.BYTES_PER_ELEMENT);
  let dstArray;
  if (srcByteStride === dstByteStride) {
    dstArray = srcArray.slice();
  } else {
    dstArray = new TypedArray(dstByteLength / TypedArray.BYTES_PER_ELEMENT);
    let dstOffset = 0;
    for (let i = 0, il = srcArray.length; i < il; i++) {
      for (let j = 0; j < itemSize; j++) dstArray[dstOffset + j] = srcArray[i * itemSize + j];
      dstOffset += dstStride;
    }
  }
  draco._free(ptr);
  return { name: attributeName, count: count, itemSize: itemSize, array: dstArray, stride: dstStride };
}

function getDracoDataType(draco, TypedArray) {
  switch (TypedArray) {
    case Float32Array:
      return draco.DT_FLOAT32;
    case Int8Array:
      return draco.DT_INT8;
    case Int16Array:
      return draco.DT_INT16;
    case Int32Array:
      return draco.DT_INT32;
    case Uint8Array:
      return draco.DT_UINT8;
    case Uint16Array:
      return draco.DT_UINT16;
    case Uint32Array:
      return draco.DT_UINT32;
    default:
      return draco.DT_FLOAT32;
  }
}
