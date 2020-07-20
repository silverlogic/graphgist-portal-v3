/* eslint no-unused-vars: 0 */
/* eslint no-loop-func: 0 */
/* eslint eqeqeq: 0 */

import $ from "jquery";
import * as d3 from "d3";
import neo from "./neod3";
import { props } from "./cypher.datatable";

export default function() {
  var styleContents = `
    node {
      diameter: 40px;
      color: #DFE1E3;
      border-color: #D4D6D7;
      border-width: 2px;
      text-color-internal: #000000;
      text-color-external: #000000;
      caption: '{name}';
      font-size: 12px;
    }
    relationship {
      color: #4356C0;
      shaft-width: 3px;
      font-size: 9px;
      padding: 3px;
      text-color-external: #000000;
      text-color-internal: #FFFFFF;
    }\n`;

  var skip = ["id", "start", "end", "source", "target", "labels", "type", "selected"];
  var prio_props = ["name", "title", "tag", "username", "lastname"];

  var serializer = null;

  var $downloadSvgLink = $('<a href="#" class="btn btn-success visualization-download" target="_blank"><i class="ui large download icon fi-download"></i> Download SVG</a>').hide().click(function () {
    $downloadSvgLink.hide();
  });
  var downloadSvgLink = $downloadSvgLink[0];
  var blobSupport = 'Blob' in window;
  var URLSupport = 'URL' in window && 'createObjectURL' in window.URL;
  var msBlobSupport = typeof window.navigator.msSaveOrOpenBlob !== 'undefined';
  var svgStyling = '<style>\ntext{font-family:sans-serif}\n</style>';

  var existingStyles = {};
  var currentColor = 1;

  function dummyFunc() {
  }

  function render(id, $container, visualization, styleConfig) {
    function extract_props(pc) {
      var p = {};
      for (var key in pc) {
        if (!pc.hasOwnProperty(key) || skip.indexOf(key) != -1) continue;
        p[key] = pc[key];
      }
      return p;
    }

    function node_styles(nodes) {
      function label(n) {
        var labels = n["labels"];
        if (labels && labels.length) {
          return labels[labels.length - 1];
        }
        return "";
      }

      var style = {};
      for (var i = 0; i < nodes.length; i++) {
        var props = nodes[i].properties = extract_props(nodes[i]);
        var keys = Object.keys(props);
        if (label(nodes[i]) !== "" && keys.length > 0) {
          var selected_keys = prio_props.filter(function (k) {
            return keys.indexOf(k) !== -1
          });
          selected_keys = selected_keys.concat(keys).concat(['id']);
          var selector = selectorFor(label(nodes[i]));
          var selectedKey = selected_keys[0];
          if (typeof(props[selectedKey]) === "string" && props[selectedKey].length > 30) {
            props[selectedKey] = props[selectedKey].substring(0,30)+" ...";
          }
          style[selector] = style[selector] || selectedKey;
        }
      }
      return style;
    }


    function isSelector(label) { return label && label.substring(0,5) == "node."; }
    function selectorFor(label) { return "node."+label; }
    function styleFor(label, property,color) {
      var textColor = window.isInternetExplorer ? '#000000' : color['text-color-internal'];
      var result =
      (isSelector(label) ? label : selectorFor(label)) + 
      " {caption: '{" + property +"}' "+
      "; color: " + color.color +
      "; border-color: " + color['border-color'] +
      "; text-color-internal: " +  textColor +
      "; text-color-external: " +  textColor +
      "; }";
      return result;
    }

    // red:Person(name), green/lightgreen/white:Book(title)
    function initialStyleConfig(styleConfig) {
       if (!styleConfig || styleConfig.trim().length == 0) return {};
       var style = {};
       var parts = styleConfig.trim().split(/[,:()]\s*/)
       for (var i=0;i<parts.length;i+=4) {
        var color=parts[i], label=parts[i+1], prop=parts[i+2];
        var colors=color.split(/\//)
        style[selectorFor(label)]=styleFor(label,prop,{color:colors[0], "border-color":colors[1]||colors[0], "text-color-internal":colors[2]||'#000000'});
       }
       return style;
    }

    function style_sheet(styles, styleContents) {
      var styleItems = [];
      var colors = neo.style.defaults.colors;
      for (var selector in styles) {
        var styleItem;
        if (selector in existingStyles) {
          styleItem = existingStyles[selector];
        } else {
          var color = colors[currentColor];
          currentColor = (currentColor + 1) % colors.length;
          var property = styles[selector];
          styleItem = styleFor(selector, property, color);
          existingStyles[selector] = styleItem;
        }
        styleItems.push(styleItem);
      }
      return styleContents + styleItems.join("\n");
    }

    function applyZoom() {
      renderer.select(".nodes").attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
      renderer.select(".relationships").attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    }

    function enableZoomHandlers() {
      renderer.on("wheel.zoom",zoomHandlers.wheel);
      renderer.on("mousewheel.zoom",zoomHandlers.mousewheel);
      renderer.on("mousedown.zoom",zoomHandlers.mousedown);
      renderer.on("DOMMouseScroll.zoom",zoomHandlers.DOMMouseScroll);
      renderer.on("touchstart.zoom",zoomHandlers.touchstart);
      renderer.on("touchmove.zoom",zoomHandlers.touchmove);
      renderer.on("touchend.zoom",zoomHandlers.touchend);
    }

    function disableZoomHandlers() {
      renderer.on("wheel.zoom",null);
      renderer.on("mousewheel.zoom",null);
      renderer.on("mousedown.zoom", null);
      renderer.on("DOMMouseScroll.zoom", null);
      renderer.on("touchstart.zoom",null);
      renderer.on("touchmove.zoom",null);
      renderer.on("touchend.zoom",null);
    }

    function keyHandler() {
      if (d3.event.altKey || d3.event.shiftKey) {
        enableZoomHandlers();
      }
      else {
         disableZoomHandlers();
      }
    }

    var existingStyles = initialStyleConfig(styleConfig);
    var links = visualization.links;
    var nodes = visualization.nodes;
    for (var i = 0; i < links.length; i++) {
      links[i].source = links[i].start;
      links[i].target = links[i].end;
      links[i].properties = props(links[i]);
    }
    var nodeStyles = node_styles(nodes);
    var styleSheet = style_sheet(nodeStyles, styleContents);

    var graphModel = neo.graphModel()
      .nodes(nodes)
      .relationships(links);
    var graphView = neo.graphView()
      .style(styleSheet)
      .width($container.width()).height($container.height()).on('nodeClicked', dummyFunc).on('relationshipClicked', dummyFunc).on('nodeDblClicked', dummyFunc);
    var renderer = d3.select("#" + id).append("svg").data([graphModel]);
    var zoomHandlers = {};
    var zoomBehavior = d3.behavior.zoom().on("zoom", applyZoom).scaleExtent([0.2, 8]);

    renderer.call(graphView);
    renderer.call(zoomBehavior);

    zoomHandlers.wheel = renderer.on("wheel.zoom");
    zoomHandlers.mousewheel = renderer.on("mousewheel.zoom");
    zoomHandlers.mousedown = renderer.on("mousedown.zoom");
    zoomHandlers.DOMMouseScroll = renderer.on("DOMMouseScroll.zoom");
    zoomHandlers.touchstart = renderer.on("touchstart.zoom");
    zoomHandlers.touchmove = renderer.on("touchmove.zoom")
    zoomHandlers.touchend = renderer.on("touchend.zoom");
    disableZoomHandlers();

    d3.select('body').on("keydown", keyHandler).on("keyup", keyHandler);

    function refresh() {
      graphView.height($container.height());
      graphView.width($container.width());
      renderer.call(graphView);
    }

    function saveToSvg() {
      var svgElement = $('#' + id).children('svg').first()[0];
      var xml = serializeSvg(svgElement, $container);
      if (!msBlobSupport && downloadSvgLink.href !== '#') {
        window.URL.revokeObjectURL(downloadSvgLink.href);
      }
      var blob = new window.Blob([xml], {
        'type': 'image/svg+xml'
      });
      var fileName = id + '.svg';
      if (!msBlobSupport) {
        downloadSvgLink.href = window.URL.createObjectURL(blob);
        $downloadSvgLink.appendTo($container).show();
        $downloadSvgLink.attr('download', fileName);
      } else {
        window.navigator.msSaveOrOpenBlob(blob, fileName);
      }
    }

    function getFunctions() {
      var funcs = {};
      if (blobSupport && (URLSupport || msBlobSupport)) {
        funcs['ui large download icon fi-download'] = {'title': 'Save as SVG', 'func':saveToSvg};
      }
      return funcs;
    }

    return  {
      'subscriptions': {
        'expand': refresh,
        'contract': refresh,
        'sizeChange': refresh
      },
      'actions': getFunctions()
    };
  }

  function serializeSvg(element, $container) {
    if (serializer === null) {
      if (typeof window.XMLSerializer !== 'undefined') {
        var xmlSerializer = new XMLSerializer();
        serializer = function (emnt) {
          return xmlSerializer.serializeToString(emnt);
        };
      } else {
        serializer = function (emnt) {
          return '<svg xmlns="http://www.w3.org/2000/svg">' + $(emnt).html() + '</svg>';
        }
      }
    }
    var svg = serializer(element);
    svg = svg.replace('<svg ', '<svg height="' + $container.height() + '" width="' + $container.width() + '" ')
      .replace(/<g/, '\n' + svgStyling + '\n<g');
    return svg;
  }

  // $.get(stylingUrl, function (data) {
  //     svgStyling = '<style>\n' + data + '\n</style>';
  //     $(svgStyling).appendTo('head');
  // });

  return {'render': render};
}
