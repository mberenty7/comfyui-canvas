precision mediump float;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying vec2 vUv;

uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uFresnelPower;
uniform float uTime;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  
  // Scanlines
  float scanline = sin(vWorldPosition.y * 80.0 + uTime * 3.0) * 0.5 + 0.5;
  scanline = smoothstep(0.3, 0.7, scanline);
  
  // Rainbow shift based on view angle
  float angle = dot(normal, viewDir);
  vec3 rainbow;
  rainbow.r = sin(angle * 6.28 + uTime) * 0.5 + 0.5;
  rainbow.g = sin(angle * 6.28 + uTime + 2.094) * 0.5 + 0.5;
  rainbow.b = sin(angle * 6.28 + uTime + 4.189) * 0.5 + 0.5;
  
  // Fresnel rim
  float fresnel = pow(1.0 - abs(angle), uFresnelPower);
  
  vec3 color = mix(uColor * 0.3, rainbow, 0.5);
  color = mix(color, uRimColor, fresnel * 0.7);
  color *= 0.7 + 0.3 * scanline;
  
  // Slight transparency at edges
  float alpha = 0.7 + 0.3 * fresnel;
  
  gl_FragColor = vec4(color, alpha);
}
