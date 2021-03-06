import inherits from 'inherits';

import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';

import {
  translate
} from 'diagram-js/lib/util/SvgTransformUtil';

import {
  componentsToPath
} from 'diagram-js/lib/util/RenderUtil';

import {
  assign
} from 'min-dash';

import {
  heightOfBottomBands,
  heightOfTopBands,
  hasBandMarker
} from '../util/BandUtil';

import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  classes as svgClasses
} from 'tiny-svg';

import {
  MESSAGE_DISTANCE
} from '../util/MessageUtil';
import { is } from 'bpmn-js/lib/util/ModelUtil';

// display specific constants that are not part of the BPMNDI standard
const CHOREO_TASK_ROUNDING = 10;
const MARKER_HEIGHT = 15;
const DEFAULT_FILL_OPACITY = .95;
const NON_INITIATING_OPACITY = .1725;

/**
 * A renderer for BPMN 2.0 choreography diagrams.
 */
export default function ChoreoRenderer(eventBus, styles, textRenderer, pathMap) {

  BaseRenderer.call(this, eventBus, 2000);

  function getLabel(caption, options) {
    var text = textRenderer.createText(caption || '', options);
    svgClasses(text).add('djs-label');
    return text;
  }

  function getBoxedLabel(caption, box, align) {
    let label = getLabel(caption, {
      box: box,
      align: align,
      padding: align === 'center-middle' ? 0 : 5,
      style: {
        fill: 'black'
      }
    });
    svgAttr(label, {
      transform: 'translate(' + box.x + ', ' + box.y + ')',
    });
    return label;
  }

  this.drawMessage = function(p, element) {
    let bandKind = element.parent.diBand.participantBandKind || 'top-initiating';
    let isBottom = bandKind.startsWith('bottom');
    let isInitiating = !bandKind.endsWith('non_initiating');

    // first, draw the connecting dotted line
    let connector = svgCreate('path');
    svgAttr(connector, {
      d: componentsToPath([
        ['M', element.width / 2, isBottom ? -MESSAGE_DISTANCE : element.height],
        ['l', 0, MESSAGE_DISTANCE]
      ]),
      stroke: 'black',
      strokeWidth: 2,
      strokeDasharray: '0, 4',
      strokeLinecap: 'round'
    });
    svgAppend(p, connector);

    // draw background
    let rect = svgCreate('rect');
    svgAttr(rect, {
      x: 0,
      y: 0,
      width: element.width,
      height: element.height,
      fill: 'white',
      fillOpacity: DEFAULT_FILL_OPACITY,
    });
    svgAppend(p, rect);

    // then, draw the envelope
    let envelope = svgCreate('path');
    svgAttr(envelope, {
      d: getEnvelopePath(element.width, element.height),
      stroke: 'black',
      strokeWidth: 2,
      fill: isInitiating ? 'white' : 'black',
      fillOpacity: isInitiating ? 0 : NON_INITIATING_OPACITY,
    });
    svgAppend(p, envelope);

    // then, attach the label
    if (element.businessObject.name) {
      let label = getBoxedLabel(element.businessObject.name, {
        x: - element.parent.width / 2 + element.width / 2,
        y: isBottom ? element.height : -element.height,
        width: element.parent.width,
        height: element.height
      }, 'center-middle');
      svgAppend(p, label);
    }

    return p;
  };

  this.drawParticipantBand = function(p, element) {
    const bandKind = element.diBand.participantBandKind || 'top-initiating';
    const isInitiating = !bandKind.endsWith('non_initiating');
    const isTop = bandKind.startsWith('top');
    const isBottom = bandKind.startsWith('bottom');
    const isMiddle = !isTop && !isBottom;

    // draw the participant band
    let bandShape = svgCreate('path');
    svgAttr(bandShape, {
      d: getParticipantBandOutline(0, 0, element.width, element.height, bandKind),
      fill: isInitiating ? 'white' : 'black',
      fillOpacity: isInitiating ? 0 : NON_INITIATING_OPACITY
    });
    svgAppend(p, bandShape);
    attachMarkerToParticipant(p, element);

    // add the line(s)
    if (isTop || isMiddle) {
      let line = svgCreate('path');
      svgAttr(line, {
        d: componentsToPath([
          ['M', 0, element.height],
          ['l', element.width, 0]
        ]),
        stroke: 'black',
        strokeWidth: 2
      });
      svgAppend(p, line);
    }
    if (isBottom || isMiddle) {
      let line = svgCreate('path');
      svgAttr(line, {
        d: componentsToPath([
          ['M', 0, 0],
          ['l', element.width, 0]
        ]),
        stroke: 'black',
        strokeWidth: 2
      });
      svgAppend(p, line);
    }

    // add the name of the participant
    let label = getBoxedLabel(element.businessObject.name, {
      x: 0,
      y: 0,
      width: element.width,
      height: element.height - ((hasBandMarker(element.businessObject)) ? MARKER_HEIGHT : 0)
    }, 'center-middle');
    svgAppend(p, label);

    return p;
  };

  this.drawChoreographyActivity = function(p, element) {
    let shape = svgCreate('path');
    svgAttr(shape, {
      d: getTaskOutline(0, 0, element.width, element.height, is(element, 'bpmn:CallChoreography') ? 2 : 0),
      fill: 'white',
      fillOpacity: DEFAULT_FILL_OPACITY,
      stroke: 'black',
      strokeWidth: is(element, 'bpmn:CallChoreography') ? 6 : 2
    });
    svgAppend(p, shape);

    let hasMarkers = attachMarkerToChoreoActivity(p, element);

    let top = heightOfTopBands(element);
    let bottom = element.height - heightOfBottomBands(element) - (hasMarkers ? 20 : 0);
    let align = 'center-middle';
    if ((is(element, 'bpmn:SubChoreography') || is(element, 'bpmn:CallChoreography')) && !element.collapsed) {
      align = 'left';
    }
    let label = getBoxedLabel(element.businessObject.name, {
      x: 0,
      y: top,
      width: element.width,
      height: bottom - top
    }, align);
    svgAppend(p, label);

    return print;
  };

  function attachMarkerToChoreoActivity(parentGfx, element) {
    const defaultFillColor = 'transparent';
    const defaultStrokeColor = 'black';
    const bottomBandHeight = heightOfBottomBands(element);

    let loopType = element.businessObject.loopType;
    let hasLoopMarker = [
      'Standard',
      'MultiInstanceSequential',
      'MultiInstanceParallel'
    ].indexOf(loopType) >= 0;
    let isCollapsed = element.collapsed;
    let offset = (isCollapsed && hasLoopMarker) ? 10 : 0;

    // draw sub choreography marker
    if (isCollapsed) {
      translate(
        drawRect(parentGfx, 14, 14, {
          fill: defaultFillColor,
          stroke: defaultStrokeColor
        }),
        element.width / 2 - 7.5 + offset,
        element.height - bottomBandHeight - 20
      );
      var markerPath = pathMap.getScaledPath('MARKER_SUB_PROCESS', {
        xScaleFactor: 1.5,
        yScaleFactor: 1.5,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: (element.width / 2 - 7.5 + offset) / element.width,
          my: (element.height - bottomBandHeight - 20) / element.height
        }
      });
      drawMarker('sub-process', parentGfx, markerPath, {
        fill: defaultFillColor,
        stroke: defaultStrokeColor
      });
    }

    // draw loop markers
    if (hasLoopMarker) {
      let loopName;
      let pathAttr = {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height
      };
      let drawAttr = {
        fill: defaultFillColor,
        stroke: defaultStrokeColor
      };

      if (loopType === 'Standard') {
        loopName = 'loop';
        pathAttr.position = {
          mx: ((element.width / 2 - offset) / element.width),
          my: (element.height - 7 - bottomBandHeight) / element.height
        };
        assign(drawAttr, {
          strokeWidth: 1,
          strokeLinecap: 'round',
          strokeMiterlimit: 0.5
        });
      } else if (loopType === 'MultiInstanceSequential') {
        loopName = 'sequential';
        pathAttr.position = {
          mx: ((element.width / 2 - 5 - offset) / element.width),
          my: (element.height - 19 - bottomBandHeight) / element.height
        };
      } else if (loopType === 'MultiInstanceParallel') {
        loopName = 'parallel';
        pathAttr.position = {
          mx: ((element.width / 2 - 6 - offset) / element.width),
          my: (element.height - 20 - bottomBandHeight) / element.height
        };
      }

      let markerPath = pathMap.getScaledPath('MARKER_' + loopName.toUpperCase(), pathAttr);
      drawMarker(loopName, parentGfx, markerPath, drawAttr);
    }

    return isCollapsed || hasLoopMarker;
  }

  function attachMarkerToParticipant(parentGfx, element) {
    const defaultFillColor = 'transparent';
    const defaultStrokeColor = 'black';
    if (hasBandMarker(element.businessObject)) {
      const markerPath = pathMap.getScaledPath('MARKER_PARALLEL', {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: ((element.width / 2 - 6) / element.width),
          my: (element.height - MARKER_HEIGHT) / element.height
        }
      });
      drawMarker('participant-multiplicity', parentGfx, markerPath, {
        strokeWidth: 1,
        fill: defaultFillColor,
        stroke: defaultStrokeColor
      });
    }
  }

  function drawMarker(type, parentGfx, d, attrs) {
    attrs = assign({ 'data-marker': type }, attrs);
    attrs = styles.computeStyle(attrs, ['no-fill'], {
      strokeWidth: 2,
      stroke: 'black'
    });

    const path = svgCreate('path');
    svgAttr(path, { d: d });
    svgAttr(path, attrs);

    svgAppend(parentGfx, path);

    return path;
  }

  function drawRect(parentGfx, width, height, attrs) {
    assign(attrs, {
      stroke: 'black',
      strokeWidth: 2,
      fill: 'white'
    });

    let rect = svgCreate('rect');
    svgAttr(rect, {
      x: 0,
      y: 0,
      width: width,
      height: height
    });
    svgAttr(rect, attrs);
    svgAppend(parentGfx, rect);
    return rect;
  }
}

inherits(ChoreoRenderer, BaseRenderer);

ChoreoRenderer.$inject = [
  'eventBus',
  'styles',
  'textRenderer',
  'pathMap'
];

ChoreoRenderer.prototype.canRender = function(element) {
  return is(element, 'bpmn:ChoreographyActivity') ||
    is(element, 'bpmn:Participant') ||
    is(element, 'bpmn:Message');
};

ChoreoRenderer.prototype.drawShape = function(p, element) {
  if (is(element, 'bpmn:ChoreographyActivity')) {
    return this.drawChoreographyActivity(p, element);
  } else if (is(element, 'bpmn:Participant')) {
    return this.drawParticipantBand(p, element);
  } else if (is(element, 'bpmn:Message')) {
    return this.drawMessage(p, element);
  }
};

ChoreoRenderer.prototype.getShapePath = function(shape) {
  if (is(shape, 'bpmn:ChoreographyActivity')) {
    return getTaskOutline(shape.x, shape.y, shape.width, shape.height, is(shape, 'bpmn:CallChoreography') ? 6 : 1);
  } else if (is(shape, 'bpmn:Participant')) {
    return getParticipantBandOutline(shape.x, shape.y, shape.width, shape.height, shape.diBand.participantBandKind);
  } else if (is(shape, 'bpmn:Message')) {
    return getMessageOutline(shape);
  }
};

function getEnvelopePath(width, height) {
  let flap = height * 0.6;
  let path = [
    ['M', 0, 0],
    ['l', 0, height],
    ['l', width, 0],
    ['l', 0, -height],
    ['z'],
    ['M', 0, 0],
    ['l', width / 2., flap],
    ['l', width / 2., -flap]
  ];
  return componentsToPath(path);
}

function getMessageOutline(x, y, width, height) {
  let path = [
    ['M', x, y],
    ['l', 0, height],
    ['l', width, 0],
    ['l', 0, -height],
    ['z']
  ];
  return componentsToPath(path);
}

function getTaskOutline(x, y, width, height, offset) {
  offset = offset || 0;
  let r = CHOREO_TASK_ROUNDING;

  x -= offset;
  y -= offset;
  width += 2 * offset;
  height += 2 * offset;
  r += offset;

  let path = [
    ['M', x + r, y],
    ['a', r, r, 0, 0, 0, -r, r],
    ['l', 0, height - 2 * r],
    ['a', r, r, 0, 0, 0, r, r],
    ['l', width - 2 * r, 0],
    ['a', r, r, 0, 0, 0, r, -r],
    ['l', 0, -height + 2 * r],
    ['a', r, r, 0, 0, 0, -r, -r],
    ['z']
  ];
  return componentsToPath(path);
}

function getParticipantBandOutline(x, y, width, height, participantBandKind) {
  let path;
  let r = CHOREO_TASK_ROUNDING;
  participantBandKind = participantBandKind || 'top_initiating';
  if (participantBandKind.startsWith('top')) {
    path = [
      ['M', x, y + height],
      ['l', width, 0],
      ['l', 0, -height + r],
      ['a', r, r, 0, 0, 0, -r, -r],
      ['l', -width + 2 * r, 0],
      ['a', r, r, 0, 0, 0, -r, r],
      ['z']
    ];
  } else if (participantBandKind.startsWith('bottom')) {
    path = [
      ['M', x + width, y],
      ['l', -width, 0],
      ['l', 0, height - r],
      ['a', r, r, 0, 0, 0, r, r],
      ['l', width - 2 * r, 0],
      ['a', r, r, 0, 0, 0, r, -r],
      ['z']
    ];
  } else {
    path = [
      ['M', x, y + height],
      ['l', width, 0],
      ['l', 0, -height],
      ['l', -width, 0],
      ['z']
    ];
  }
  return componentsToPath(path);
}