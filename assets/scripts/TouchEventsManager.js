cc.Class({
  extends: cc.Component,
  properties: {
    // For joystick begins.
    translationListenerNode: {
      default: null,
      type: cc.Node
    },
    zoomingListenerNode: {
      default: null,
      type: cc.Node
    },
    stickhead: {
      default: null,
      type: cc.Node
    },
    base: {
      default: null,
      type: cc.Node
    },
    joyStickEps: {
      default: 0.10,
      type: cc.Float
    },
    magicLeanLowerBound: {
      default: 0.414, // Tangent of (PI/8).
      type: cc.Float
    },
    magicLeanUpperBound: {
      default: 2.414, // Tangent of (3*PI/8).
      type: cc.Float
    },
    // For joystick ends.
    pollerFps: {
      default: 10,
      type: cc.Integer
    },
    minScale: {
      default: 1.00,
      type: cc.Float
    },
    maxScale: {
      default: 2.50,
      type: cc.Float
    },
    maxMovingBufferLength: {
      default: 1,
      type: cc.Integer
    },
    zoomingScaleFacBase: {
      default: 0.10,
      type: cc.Float
    },
    zoomingSpeedBase: {
      default: 4.0,
      type: cc.Float
    },
    linearSpeedBase: {
      default: 320.0,
      type: cc.Float
    },
    linearMovingEps: {
      default: 0.10,
      type: cc.Float
    },
    scaleByEps: {
      default: 0.0375,
      type: cc.Float
    },
  },

  start() {},

  init(mapScriptIns, mapNode, canvasNode, isUsingJoystick) {
    this.mapNode = mapNode;
    this.canvasNode = canvasNode;
    this.isUsingJoystick = isUsingJoystick;
    if (!this.isUsingJoystick) {
      this.translationListenerNode = mapNode;
      this.zoomingListenerNode = mapNode;
    }
    // This is a dirty fix!
    this.mapScriptIns = mapScriptIns;
    this.cachedStickHeadPosition = cc.v2(0.0, 0.0);
    this.mainCameraNode = mapScriptIns.mainCameraNode; // Cannot drag and assign the `mainCameraNode` from CocosCreator EDITOR directly, otherwise it'll cause an infinite loading time, till v2.1.0.
    this.mainCamera = mapScriptIns.mainCamera;
    this.activeDirection = {
      dx: 0.0,
      dy: 0.0
    };

    this.maxHeadDistance = (0.5 * this.base.width);

    this._initTouchEvent();

    this.initialized = true;
  },

  _isTouchEnabled() {
    const self = this;
    if (!self.mapScriptIns.isPurelyVisual()) {
      return false;
    }
    return true;
  },

  _isUsingJoystick() {
    return this.isUsingJoystick;
  },

  onLoad() {
    // TBD.
  },

  onDestroy() {
    clearInterval(this.mainLoopTimer);
  },

  _initTouchEvent() {
    const self = this;
    const translationListenerNode = (self.translationListenerNode ? self.translationListenerNode : self.mapNode);
    const zoomingListenerNode = (self.zoomingListenerNode ? self.zoomingListenerNode : self.mapNode);

    translationListenerNode.inTouchPoints = new Map();
    translationListenerNode.on(cc.Node.EventType.TOUCH_START, function(event) {
      self._touchStartEvent(event);
    });
    translationListenerNode.on(cc.Node.EventType.TOUCH_MOVE, function(event) {
      self._translationEvent(event);
    });
    translationListenerNode.on(cc.Node.EventType.TOUCH_END, function(event) {
      self._touchEndEvent(event);
    });
    translationListenerNode.on(cc.Node.EventType.TOUCH_CANCEL, function(event) {
      self._touchEndEvent(event);
    });

    zoomingListenerNode.inTouchPoints = new Map();
    zoomingListenerNode.on(cc.Node.EventType.TOUCH_START, function(event) {
      self._touchStartEvent(event);
    });
    zoomingListenerNode.on(cc.Node.EventType.TOUCH_MOVE, function(event) {
      self._zoomingEvent(event);
    });
    zoomingListenerNode.on(cc.Node.EventType.TOUCH_END, function(event) {
      self._touchEndEvent(event);
    });
    zoomingListenerNode.on(cc.Node.EventType.TOUCH_CANCEL, function(event) {
      self._touchEndEvent(event);
    });
  },

  _touchStartEvent(event) {
    const theListenerNode = event.target;
    if (!theListenerNode || !theListenerNode.inTouchPoints) return;
    for (let touch of event._touches) {
      theListenerNode.inTouchPoints.set(touch._id, touch);
    }
  },

  isMapOverMoved(cameraPos) {
    return tileCollisionManager.cameraIsOutOfGrandBoundary(this.mapNode, cameraPos.sub(this.mapNode.position));
  },

  _translationEvent(event) {
    const self = this;
    const theListenerNode = event.target;
    if (!theListenerNode || !theListenerNode.inTouchPoints) return;
    if (1 != theListenerNode.inTouchPoints.size) {
      return;
    }
    if (!theListenerNode.inTouchPoints.has(event.currentTouch._id)) {
      return;
    }

    if (false == this._isUsingJoystick()) {
      const immediateDiffVec = event.currentTouch.getDelta(); // On screen coordinates, reference https://docs.cocos.com/creator/2.1/api/en/?q=touch.
      if (self.mapScriptIns.isPurelyVisual()) {
        const cameraPos = self.mainCameraNode.position.sub(immediateDiffVec);
        if (self.isMapOverMoved(cameraPos)) {
          return;
        }
        self.mainCameraNode.setPosition(cameraPos);
      } else {
        if (null != self.mapScriptIns.onMovingBuildableInstance) {
          const touchLocation = event.currentTouch.getLocation();
          const touchPosInCamera = cc.v2(touchLocation.x, touchLocation.y).sub(cc.v2(self.canvasNode.width * self.canvasNode.anchorX, self.canvasNode.height * self.canvasNode.anchorY));
          self.mapScriptIns.onMovingBuildableInstance(touchPosInCamera, immediateDiffVec);
        }
      }
    } else {
      const diffVec = event.currentTouch._point.sub(event.currentTouch._startPoint);
      const distance = diffVec.mag();
      const overMoved = (distance > this.maxHeadDistance);
      if (overMoved) {
        const ratio = (this.maxHeadDistance / distance);
        this.cachedStickHeadPosition = diffVec.mul(ratio);
      } else {
        const ratio = (distance / this.maxHeadDistance);
        this.cachedStickHeadPosition = diffVec.mul(ratio);
      }
    }
  },

  _zoomingEvent(event) {
    if (!this._isTouchEnabled()) {
      return;
    }
    const theListenerNode = event.target;
    if (!theListenerNode || !theListenerNode.inTouchPoints) return;
    if (2 != theListenerNode.inTouchPoints.size) {
      return;
    }
    if (2 == event._touches.length) {
      const firstTouch = event._touches[0];
      const secondTouch = event._touches[1];

      const startMagnitude = firstTouch._startPoint.sub(secondTouch._startPoint).mag();
      const currentMagnitude = firstTouch._point.sub(secondTouch._point).mag();

      /* 
       * Although I have no way accessing the linear factor where "startMagnitude & currentMagnitude" scales from 
       * the `mapNode` or `canvasNode` magnitudes, the following calculation for `scaleBy` eliminates the common factor.    
       *  -- YFLu
       */
      let scaleBy = (currentMagnitude / startMagnitude);
      scaleBy = 1 + (scaleBy - 1) * this.zoomingScaleFacBase;
      if (1 < scaleBy && Math.abs(scaleBy - 1) < this.scaleByEps) {
        // Jitterring.
        cc.log(`Spot #1 ScaleBy == ${scaleBy} from startMagnitude == ${startMagnitude} and currentMagnitude = ${currentMagnitude} is just jittering.`);
        return;
      }
      if (1 > scaleBy && Math.abs(scaleBy - 1) < 0.5 * this.scaleByEps) {
        // Jitterring.
        cc.log(`Spot #2 ScaleBy == ${scaleBy} from startMagnitude == ${startMagnitude} and currentMagnitude = ${currentMagnitude} is just jittering.`);
        return;
      }
      if (!this.mainCamera) return;
      const targetScale = this.mainCamera.zoomRatio * scaleBy;
      if (this.minScale > targetScale || targetScale > this.maxScale) {
        cc.log(`Spot #3 ScaleBy == ${scaleBy} from startMagnitude == ${startMagnitude} and currentMagnitude = ${currentMagnitude}, when this.mainCamera.zoomRatio == ${this.mainCamera.zoomRatio} is too tiny or too large.`);
        return;
      }
      this.mainCamera.zoomRatio = targetScale;
      for (let child of this.mainCameraNode.children) {
        if ("coverVideoNode" == child.getName()) continue; // A dirty hack.
        child.setScale(1 / targetScale);
      }
    }
  },

  _touchEndEvent(event) {
    const theListenerNode = event.target;
    if (!theListenerNode || !theListenerNode.inTouchPoints) return;
    do {
      if (!theListenerNode.inTouchPoints.has(event.currentTouch._id)) {
        break;
      }
      if (!this._isTouchEnabled()) {
        break;
      }
      const diffVec = event.currentTouch._point.sub(event.currentTouch._startPoint);
      const diffVecMag = diffVec.mag();
      if (this.linearMovingEps <= diffVecMag) {
        break;
      }
      // Only triggers map-state-switch when `diffVecMag` is sufficiently small.

    // TODO: Handle single-finger-click event.
    } while (false);
    this.cachedStickHeadPosition = cc.v2(0.0, 0.0);
    const previousInTouchPointsSetSize = theListenerNode.inTouchPoints.size;
    for (let touch of event._touches) {
      if (touch) {
        theListenerNode.inTouchPoints.delete(touch._id);
      }
    }
    if (0 == theListenerNode.inTouchPoints.size && 1 == previousInTouchPointsSetSize) {
      if (this.mapScriptIns.onSignlePointTouchended) {
        this.mapScriptIns.onSignlePointTouchended(event.currentTouch._point);
      }
    }
  },

  _touchCancelEvent(event) {
    this.mapNode.dispatchEvent(event);
  },

  update(dt) {
    if (true != this.initialized) return;
    if (1 < this.zoomingListenerNode.inTouchPoints.size) return;
    if (!this._isUsingJoystick()) return;
    this.stickhead.setPosition(this.cachedStickHeadPosition);
    const eps = this.joyStickEps;

    if (Math.abs(this.cachedStickHeadPosition.x) < eps && Math.abs(this.cachedStickHeadPosition.y) < eps) {
      this.activeDirection.dx = 0;
      this.activeDirection.dy = 0;
      return;
    }

    this.activeDirection = this.discretizeDirection(this.cachedStickHeadPosition.x, this.cachedStickHeadPosition.y, eps);
  },

  discretizeDirection(continuousDx, continuousDy, eps) {
    let ret = {
      dx: 0,
      dy: 0,
    };
    if (Math.abs(continuousDx) < eps) {
      ret.dx = 0;
      ret.dy = continuousDy > 0 ? +1 : -1;
    } else if (Math.abs(continuousDy) < eps) {
      ret.dx = continuousDx > 0 ? +2 : -2;
      ret.dy = 0;
    } else {
      const criticalRatio = continuousDy / continuousDx;
      if (criticalRatio > this.magicLeanLowerBound && criticalRatio < this.magicLeanUpperBound) {
        ret.dx = continuousDx > 0 ? +2 : -2;
        ret.dy = continuousDx > 0 ? +1 : -1;
      } else if (criticalRatio > -this.magicLeanUpperBound && criticalRatio < -this.magicLeanLowerBound) {
        ret.dx = continuousDx > 0 ? +2 : -2;
        ret.dy = continuousDx > 0 ? -1 : +1;
      } else {
        if (Math.abs(criticalRatio) < 1) {
          ret.dx = continuousDx > 0 ? +2 : -2;
          ret.dy = 0;
        } else {
          ret.dx = 0;
          ret.dy = continuousDy > 0 ? +1 : -1;
        }
      }
    }
    return ret;
  },
});