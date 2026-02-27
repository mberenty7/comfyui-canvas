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
  vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
  
  float NdotL = dot(normal, lightDir);
  
  // Quantize to 3 bands
  float toon;
  if (NdotL > 0.5) toon = 1.0;
  else if (NdotL > 0.0) toon = 0.6;
  else toon = 0.3;
  
  vec3 color = uColor * toon;
  
  // Rim highlight
  vec3 viewDir = normalize(vViewPosition);
  float rim = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
  color += uRimColor * rim * 0.5;
  
  gl_FragColor = vec4(color, 1.0);
}
