// devices.js — pure microphone-selection logic (the enumerateDevices() result is
// passed in, so this is testable without the browser).

// The audio input devices from a MediaDeviceInfo list.
export function audioInputs(devices) {
  return devices.filter((d) => d.kind === 'audioinput');
}

// Choose which microphone to use: the saved one if it is still connected,
// otherwise the first available input ('' when there are none / no choice).
export function pickDeviceId(devices, savedId) {
  const inputs = audioInputs(devices);
  if (savedId && inputs.some((d) => d.deviceId === savedId)) return savedId;
  return inputs.length ? inputs[0].deviceId : '';
}
