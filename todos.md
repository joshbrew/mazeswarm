
- Fix webgpu engine not booting in web worker
- UX/UI
- Difficulty settings
- Convert blorb entities to a much more efficient system as the position/rotation updates take up too much CPU, just use a particle buffer or something cheap so we can scale up the numbers.
   - - should solve stutter, if not look deeper https://doc.babylonjs.com/features/featuresDeepDive/particles/solid_particle_system
   - - Thin instances closer to what we want: https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
- figure out what is costing so much in the data transfer for a 3ms onmessage call (we took care of arraybuffers)
- more placements with pinball-like behaviorsssss
