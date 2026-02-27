precision mediump float;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uFresnelPower;
uniform float uTime;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  
  float fresnel = pow(1.0 - abs(dot(normal, viewDir)), uFresnelPower);
  
  // Subtle pulse on the rim
  float pulse = 0.9 + 0.1 * sin(uTime * 2.0);
  
  vec3 color = mix(uColor, uRimColor * pulse, fresnel);
  
  // Simple hemispheric ambient
  float hemi = 0.5 + 0.5 * normal.y;
  color *= 0.6 + 0.4 * hemi;
  
  gl_FragColor = vec4(color, 1.0);
}
