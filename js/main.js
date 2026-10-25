'use strict';

loadTextures(()=>{
  makeLeatherIcons();
  initThree();
  lastT=performance.now();
  requestAnimationFrame(loop);
});
