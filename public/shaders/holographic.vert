#include <skinning_pars_vertex>

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vUv = uv;

  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>

  vNormal = normalize(normalMatrix * objectNormal);

  #include <begin_vertex>
  #include <skinning_vertex>

  vWorldPosition = transformed;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
