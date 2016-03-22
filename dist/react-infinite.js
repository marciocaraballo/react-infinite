(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Infinite = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
'use strict';

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var React = global.React || require('react');
var ReactDOM = global.ReactDOM || require('react-dom');

require('./utils/establish-polyfills');
var scaleEnum = require('./utils/scaleEnum');
var infiniteHelpers = require('./utils/infiniteHelpers');
var _isFinite = require('lodash.isfinite');
var _throttle = require('lodash.throttle');

var preloadType = require('./utils/types').preloadType;
var checkProps = checkProps = require('./utils/checkProps');

var Infinite = React.createClass({
  displayName: 'Infinite',

  propTypes: {
    children: React.PropTypes.any,

    handleScroll: React.PropTypes.func,

    // preloadBatchSize causes updates only to
    // happen each preloadBatchSize pixels of scrolling.
    // Set a larger number to cause fewer updates to the
    // element list.
    preloadBatchSize: preloadType,
    // preloadAdditionalHeight determines how much of the
    // list above and below the container is preloaded even
    // when it is not currently visible to the user. In the
    // regular scroll implementation, preloadAdditionalHeight
    // is equal to the entire height of the list.
    preloadAdditionalHeight: preloadType, // page to screen ratio

    // The provided elementHeight can be either
    //  1. a constant: all elements are the same height
    //  2. an array containing the height of each element
    elementHeight: React.PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.arrayOf(React.PropTypes.number)]).isRequired,
    // This is the total height of the visible window. One
    // of
    containerHeight: React.PropTypes.number,
    useWindowAsScrollContainer: React.PropTypes.bool,

    displayBottomUpwards: React.PropTypes.bool.isRequired,

    infiniteLoadBeginEdgeOffset: React.PropTypes.number,
    onInfiniteLoad: React.PropTypes.func,
    loadingSpinnerDelegate: React.PropTypes.node,

    isInfiniteLoading: React.PropTypes.bool,
    timeScrollStateLastsForAfterUserScrolls: React.PropTypes.number,

    className: React.PropTypes.string,

    //Custom: depend on data structures, so we don't need to
    // 1) Create all children before rendering
    // 2) Use unique keys for each child
    cursor: React.PropTypes.object,

    childRender: React.PropTypes.func.isRequired
  },
  statics: {
    containerHeightScaleFactor: function containerHeightScaleFactor(factor) {
      if (!_isFinite(factor)) {
        throw new Error('The scale factor must be a number.');
      }
      return {
        type: scaleEnum.CONTAINER_HEIGHT_SCALE_FACTOR,
        amount: factor
      };
    }
  },

  // Properties currently used but which may be
  // refactored away in the future.
  computedProps: {},
  utils: {},
  shouldAttachToBottom: false,
  preservedScrollState: 0,
  loadingSpinnerHeight: 0,
  deprecationWarned: false,

  getDefaultProps: function getDefaultProps() {
    return {
      handleScroll: function handleScroll() {},

      useWindowAsScrollContainer: false,

      onInfiniteLoad: function onInfiniteLoad() {},
      loadingSpinnerDelegate: React.createElement('div', null),

      displayBottomUpwards: false,

      isInfiniteLoading: false,
      timeScrollStateLastsForAfterUserScrolls: 150,

      className: '',

      //Custom impl
      cursor: null
    };
  },

  // automatic adjust to scroll direction
  // give spinner a ReactCSSTransitionGroup
  getInitialState: function getInitialState() {
    var nextInternalState = this.recomputeInternalStateFromProps(this.props);

    this.computedProps = nextInternalState.computedProps;
    this.utils = nextInternalState.utils;
    this.shouldAttachToBottom = this.props.displayBottomUpwards;

    var state = nextInternalState.newState;
    state.scrollTimeout = undefined;
    state.isScrolling = false;

    return state;
  },

  generateComputedProps: function generateComputedProps(props) {
    // These are extracted so their type definitions do not conflict.
    var containerHeight = props.containerHeight;
    var preloadBatchSize = props.preloadBatchSize;
    var preloadAdditionalHeight = props.preloadAdditionalHeight;

    var oldProps = _objectWithoutProperties(props, ['containerHeight', 'preloadBatchSize', 'preloadAdditionalHeight']);

    var newProps = {};
    containerHeight = typeof containerHeight === 'number' ? containerHeight : 0;
    newProps.containerHeight = props.useWindowAsScrollContainer ? window.innerHeight : containerHeight;

    if (oldProps.infiniteLoadBeginBottomOffset !== undefined) {
      newProps.infiniteLoadBeginEdgeOffset = oldProps.infiniteLoadBeginBottomOffset;
      if (!this.deprecationWarned) {
        console.error('Warning: React Infinite\'s infiniteLoadBeginBottomOffset prop\n        has been deprecated as of 0.6.0. Please use infiniteLoadBeginEdgeOffset.\n        Because this is a rather descriptive name, a simple find and replace\n        should suffice.');
        this.deprecationWarned = true;
      }
    }

    var defaultPreloadBatchSizeScaling = {
      type: scaleEnum.CONTAINER_HEIGHT_SCALE_FACTOR,
      amount: 0.5
    };
    var batchSize = preloadBatchSize && preloadBatchSize.type ? preloadBatchSize : defaultPreloadBatchSizeScaling;

    if (typeof preloadBatchSize === 'number') {
      newProps.preloadBatchSize = preloadBatchSize;
    } else if (batchSize.type === scaleEnum.CONTAINER_HEIGHT_SCALE_FACTOR) {
      newProps.preloadBatchSize = newProps.containerHeight * batchSize.amount;
    } else {
      newProps.preloadBatchSize = 0;
    }

    var defaultPreloadAdditionalHeightScaling = {
      type: scaleEnum.CONTAINER_HEIGHT_SCALE_FACTOR,
      amount: 1
    };
    var additionalHeight = preloadAdditionalHeight && preloadAdditionalHeight.type ? preloadAdditionalHeight : defaultPreloadAdditionalHeightScaling;
    if (typeof preloadAdditionalHeight === 'number') {
      newProps.preloadAdditionalHeight = preloadAdditionalHeight;
    } else if (additionalHeight.type === scaleEnum.CONTAINER_HEIGHT_SCALE_FACTOR) {
      newProps.preloadAdditionalHeight = newProps.containerHeight * additionalHeight.amount;
    } else {
      newProps.preloadAdditionalHeight = 0;
    }

    return Object.assign(oldProps, newProps);
  },

  generateComputedUtilityFunctions: function generateComputedUtilityFunctions(props) {
    var _this = this;

    var utilities = {};
    utilities.getLoadingSpinnerHeight = function () {
      var loadingSpinnerHeight = 0;
      if (_this.refs && _this.refs.loadingSpinner) {
        var loadingSpinnerNode = ReactDOM.findDOMNode(_this.refs.loadingSpinner);
        loadingSpinnerHeight = loadingSpinnerNode.offsetHeight || 0;
      }
      return loadingSpinnerHeight;
    };
    if (props.useWindowAsScrollContainer) {
      utilities.subscribeToScrollListener = function () {
        window.addEventListener('scroll', _this.infiniteHandleScroll);
      };
      utilities.unsubscribeFromScrollListener = function () {
        window.removeEventListener('scroll', _this.infiniteHandleScroll);
      };
      utilities.nodeScrollListener = function () {};
      utilities.getScrollTop = function () {
        return window.pageYOffset;
      };
      utilities.setScrollTop = function (top) {
        window.scroll(window.pageXOffset, top);
      };
      utilities.scrollShouldBeIgnored = function () {
        return false;
      };
      utilities.buildScrollableStyle = function () {
        return {};
      };
    } else {
      utilities.subscribeToScrollListener = function () {};
      utilities.unsubscribeFromScrollListener = function () {};
      utilities.nodeScrollListener = this.infiniteHandleScroll;
      utilities.getScrollTop = function () {
        var scrollable;
        if (_this.refs && _this.refs.scrollable) {
          scrollable = ReactDOM.findDOMNode(_this.refs.scrollable);
        }
        return scrollable ? scrollable.scrollTop : 0;
      };

      utilities.setScrollTop = function (top) {
        var scrollable;
        if (_this.refs && _this.refs.scrollable) {
          scrollable = ReactDOM.findDOMNode(_this.refs.scrollable);
        }
        if (scrollable) {
          scrollable.scrollTop = top;
        }
      };
      utilities.scrollShouldBeIgnored = function (event) {
        return event.target !== ReactDOM.findDOMNode(_this.refs.scrollable);
      };

      utilities.buildScrollableStyle = function () {
        return {
          height: _this.computedProps.containerHeight,
          overflowX: 'hidden',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        };
      };
    }
    return utilities;
  },

  recomputeInternalStateFromProps: function recomputeInternalStateFromProps(props) {
    checkProps(props);
    var computedProps = this.generateComputedProps(props);
    var utils = this.generateComputedUtilityFunctions(props);

    var newState = {};

    //Custom: take future child count from cursor, not children
    newState.numberOfChildren = computedProps.cursor.count();

    newState.infiniteComputer = infiniteHelpers.createInfiniteComputer(computedProps.elementHeight, computedProps.cursor, computedProps.displayBottomUpwards);

    if (computedProps.isInfiniteLoading !== undefined) {
      newState.isInfiniteLoading = computedProps.isInfiniteLoading;
    }

    newState.preloadBatchSize = computedProps.preloadBatchSize;
    newState.preloadAdditionalHeight = computedProps.preloadAdditionalHeight;

    newState = Object.assign(newState, infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(newState, utils.getScrollTop()));

    return {
      computedProps: computedProps,
      utils: utils,
      newState: newState
    };
  },

  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    var nextInternalState = this.recomputeInternalStateFromProps(nextProps);

    this.computedProps = nextInternalState.computedProps;
    this.utils = nextInternalState.utils;

    this.setState(nextInternalState.newState);
  },

  componentWillUpdate: function componentWillUpdate() {
    if (this.props.displayBottomUpwards) {
      this.preservedScrollState = this.utils.getScrollTop() - this.loadingSpinnerHeight;
    }
  },

  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (this.props.displayBottomUpwards) {
      // this line was in the bottom of this function, moved to here for performance improvments
      this.loadingSpinnerHeight = this.utils.getLoadingSpinnerHeight();

      var lowestScrollTop = this.getLowestPossibleScrollTop();
      if (this.shouldAttachToBottom && this.utils.getScrollTop() < lowestScrollTop) {
        this.utils.setScrollTop(lowestScrollTop);
      } else if (prevProps.isInfiniteLoading && !this.props.isInfiniteLoading) {
        this.utils.setScrollTop(this.state.infiniteComputer.getTotalScrollableHeight() - prevState.infiniteComputer.getTotalScrollableHeight() + this.preservedScrollState);
      }
    }

    //Custom using cursors instead of children
    var hasLoadedMoreChildren = this.props.cursor.count() !== prevProps.cursor.count();
    if (hasLoadedMoreChildren) {
      var newApertureState = infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(this.state, this.utils.getScrollTop());
      this.setState(newApertureState);
    }

    var isMissingVisibleRows = hasLoadedMoreChildren && !this.hasAllVisibleItems() && !this.state.isInfiniteLoading;
    if (isMissingVisibleRows) {
      this.onInfiniteLoad();
    }
  },

  componentDidMount: function componentDidMount() {
    this.utils.subscribeToScrollListener();

    if (!this.hasAllVisibleItems()) {
      this.onInfiniteLoad();
    }

    if (this.props.displayBottomUpwards) {
      var lowestScrollTop = this.getLowestPossibleScrollTop();
      if (this.shouldAttachToBottom && this.utils.getScrollTop() < lowestScrollTop) {
        this.utils.setScrollTop(lowestScrollTop);
      }
    }
    // fix some performance issues
    this.infiniteHandleScroll = _throttle(this.infiniteHandleScroll, 10);
  },

  componentWillUnmount: function componentWillUnmount() {
    this.utils.unsubscribeFromScrollListener();
  },

  infiniteHandleScroll: function infiniteHandleScroll(e) {
    if (this.utils.scrollShouldBeIgnored(e)) {
      return;
    }
    this.computedProps.handleScroll(ReactDOM.findDOMNode(this.refs.scrollable));
    this.handleScroll(this.utils.getScrollTop());
  },

  manageScrollTimeouts: function manageScrollTimeouts() {
    // Maintains a series of timeouts to set this.state.isScrolling
    // to be true when the element is scrolling.

    if (this.state.scrollTimeout) {
      clearTimeout(this.state.scrollTimeout);
    }

    var that = this,
        scrollTimeout = setTimeout(function () {
      that.setState({
        isScrolling: false,
        scrollTimeout: undefined
      });
    }, this.computedProps.timeScrollStateLastsForAfterUserScrolls);

    this.setState({
      isScrolling: true,
      scrollTimeout: scrollTimeout
    });
  },

  getLowestPossibleScrollTop: function getLowestPossibleScrollTop() {
    return this.state.infiniteComputer.getTotalScrollableHeight() - this.computedProps.containerHeight;
  },

  hasAllVisibleItems: function hasAllVisibleItems() {
    return !(_isFinite(this.computedProps.infiniteLoadBeginEdgeOffset) && this.state.infiniteComputer.getTotalScrollableHeight() < this.computedProps.containerHeight);
  },

  passedEdgeForInfiniteScroll: function passedEdgeForInfiniteScroll(scrollTop) {
    if (this.computedProps.displayBottomUpwards) {
      return !this.shouldAttachToBottom && scrollTop < this.computedProps.infiniteLoadBeginEdgeOffset;
    } else {
      return scrollTop > this.state.infiniteComputer.getTotalScrollableHeight() - this.computedProps.containerHeight - this.computedProps.infiniteLoadBeginEdgeOffset;
    }
  },

  onInfiniteLoad: function onInfiniteLoad() {
    this.setState({ isInfiniteLoading: true });
    this.computedProps.onInfiniteLoad();
  },

  handleScroll: function handleScroll(scrollTop) {
    this.shouldAttachToBottom = this.computedProps.displayBottomUpwards && scrollTop >= this.getLowestPossibleScrollTop();

    this.manageScrollTimeouts();

    var newApertureState = infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(this.state, scrollTop);

    if (this.passedEdgeForInfiniteScroll(scrollTop) && !this.state.isInfiniteLoading) {
      this.setState(Object.assign({}, newApertureState));
      this.onInfiniteLoad();
    } else {
      this.setState(newApertureState);
    }
  },

  buildHeightStyle: function buildHeightStyle(height) {
    return {
      width: '100%',
      height: Math.ceil(height)
    };
  },

  render: function render() {
    var _this2 = this;

    var displayables;

    if (this.computedProps.cursor.count() > 1) {
      displayables = this.computedProps.cursor.slice(this.state.displayIndexStart, this.state.displayIndexEnd + 1);
    } else {
      displayables = this.computedProps.cursor;
    }

    var displayablesRender = displayables.map(function (displayable, i) {
      return _this2.props.childRender(displayable, i);
    });

    var infiniteScrollStyles = {};
    if (this.state.isScrolling) {
      infiniteScrollStyles.pointerEvents = 'none';
    }

    var topSpacerHeight = this.state.infiniteComputer.getTopSpacerHeight(this.state.displayIndexStart),
        bottomSpacerHeight = this.state.infiniteComputer.getBottomSpacerHeight(this.state.displayIndexEnd);

    // This asymmetry is due to a reluctance to use CSS to control
    // the bottom alignment
    if (this.computedProps.displayBottomUpwards) {
      var heightDifference = this.computedProps.containerHeight - this.state.infiniteComputer.getTotalScrollableHeight();
      if (heightDifference > 0) {
        topSpacerHeight = heightDifference - this.loadingSpinnerHeight;
      }
    }

    var loadingSpinner = this.computedProps.infiniteLoadBeginEdgeOffset === undefined ? null : React.createElement(
      'div',
      { ref: 'loadingSpinner' },
      this.state.isInfiniteLoading ? this.computedProps.loadingSpinnerDelegate : null
    );

    var loadMore = this.props.renderLoadMore ? this.props.renderLoadMore() : null;

    // topSpacer and bottomSpacer take up the amount of space that the
    // rendered elements would have taken up otherwise
    return React.createElement(
      'div',
      { className: this.computedProps.className,
        ref: 'scrollable',
        style: this.utils.buildScrollableStyle(),
        onScroll: this.utils.nodeScrollListener },
      React.createElement(
        'div',
        { ref: 'smoothScrollingWrapper', style: infiniteScrollStyles },
        React.createElement('div', { ref: 'topSpacer',
          style: this.buildHeightStyle(topSpacerHeight) }),
        this.computedProps.displayBottomUpwards && loadingSpinner,
        displayablesRender,
        loadMore,
        !this.computedProps.displayBottomUpwards && loadingSpinner,
        React.createElement('div', { ref: 'bottomSpacer',
          style: this.buildHeightStyle(bottomSpacerHeight) })
      )
    );
  }
});

module.exports = Infinite;
global.Infinite = Infinite;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./utils/checkProps":11,"./utils/establish-polyfills":12,"./utils/infiniteHelpers":13,"./utils/scaleEnum":14,"./utils/types":15,"lodash.isfinite":3,"lodash.throttle":4,"react":undefined,"react-dom":undefined}],2:[function(require,module,exports){
/**
 * lodash 3.0.4 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var arrayTag = '[object Array]',
    funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = isArray;

},{}],3:[function(require,module,exports){
(function (global){
/**
 * lodash 3.2.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsFinite = global.isFinite;

/**
 * Checks if `value` is a finite primitive number.
 *
 * **Note:** This method is based on [`Number.isFinite`](http://ecma-international.org/ecma-262/6.0/#sec-number.isfinite).
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a finite number, else `false`.
 * @example
 *
 * _.isFinite(10);
 * // => true
 *
 * _.isFinite('10');
 * // => false
 *
 * _.isFinite(true);
 * // => false
 *
 * _.isFinite(Object(10));
 * // => false
 *
 * _.isFinite(Infinity);
 * // => false
 */
function isFinite(value) {
  return typeof value == 'number' && nativeIsFinite(value);
}

module.exports = isFinite;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],4:[function(require,module,exports){
/**
 * lodash 4.0.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var debounce = require('lodash.debounce');

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. The throttled function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to
 * immediately invoke them. Provide an options object to indicate whether
 * `func` should be invoked on the leading and/or trailing edge of the `wait`
 * timeout. The `func` is invoked with the last arguments provided to the
 * throttled function. Subsequent calls to the throttled function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
 * on the trailing edge of the timeout only if the throttled function is
 * invoked more than once during the `wait` timeout.
 *
 * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
 * for details over the differences between `_.throttle` and `_.debounce`.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to throttle.
 * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
 * @param {Object} [options] The options object.
 * @param {boolean} [options.leading=true] Specify invoking on the leading
 *  edge of the timeout.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing
 *  edge of the timeout.
 * @returns {Function} Returns the new throttled function.
 * @example
 *
 * // Avoid excessively updating the position while scrolling.
 * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
 *
 * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
 * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
 * jQuery(element).on('click', throttled);
 *
 * // Cancel the trailing throttled invocation.
 * jQuery(window).on('popstate', throttled.cancel);
 */
function throttle(func, wait, options) {
  var leading = true,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  if (isObject(options)) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }
  return debounce(func, wait, {
    'leading': leading,
    'maxWait': wait,
    'trailing': trailing
  });
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = throttle;

},{"lodash.debounce":5}],5:[function(require,module,exports){
/**
 * lodash 4.0.3 (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright 2012-2016 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2016 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @type {Function}
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => logs the number of milliseconds it took for the deferred function to be invoked
 */
var now = Date.now;

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide an options object to indicate whether `func` should be invoked on
 * the leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent calls
 * to the debounced function return the result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
 * on the trailing edge of the timeout only if the debounced function is
 * invoked more than once during the `wait` timeout.
 *
 * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options] The options object.
 * @param {boolean} [options.leading=false] Specify invoking on the leading
 *  edge of the timeout.
 * @param {number} [options.maxWait] The maximum time `func` is allowed to be
 *  delayed before it's invoked.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing
 *  edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var args,
      maxTimeoutId,
      result,
      stamp,
      thisArg,
      timeoutId,
      trailingCall,
      lastCalled = 0,
      leading = false,
      maxWait = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxWait = 'maxWait' in options && nativeMax(toNumber(options.maxWait) || 0, wait);
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
    }
    lastCalled = 0;
    args = maxTimeoutId = thisArg = timeoutId = trailingCall = undefined;
  }

  function complete(isCalled, id) {
    if (id) {
      clearTimeout(id);
    }
    maxTimeoutId = timeoutId = trailingCall = undefined;
    if (isCalled) {
      lastCalled = now();
      result = func.apply(thisArg, args);
      if (!timeoutId && !maxTimeoutId) {
        args = thisArg = undefined;
      }
    }
  }

  function delayed() {
    var remaining = wait - (now() - stamp);
    if (remaining <= 0 || remaining > wait) {
      complete(trailingCall, maxTimeoutId);
    } else {
      timeoutId = setTimeout(delayed, remaining);
    }
  }

  function flush() {
    if ((timeoutId && trailingCall) || (maxTimeoutId && trailing)) {
      result = func.apply(thisArg, args);
    }
    cancel();
    return result;
  }

  function maxDelayed() {
    complete(trailing, timeoutId);
  }

  function debounced() {
    args = arguments;
    stamp = now();
    thisArg = this;
    trailingCall = trailing && (timeoutId || !leading);

    if (maxWait === false) {
      var leadingCall = leading && !timeoutId;
    } else {
      if (!lastCalled && !maxTimeoutId && !leading) {
        lastCalled = stamp;
      }
      var remaining = maxWait - (stamp - lastCalled);

      var isCalled = (remaining <= 0 || remaining > maxWait) &&
        (leading || maxTimeoutId);

      if (isCalled) {
        if (maxTimeoutId) {
          maxTimeoutId = clearTimeout(maxTimeoutId);
        }
        lastCalled = stamp;
        result = func.apply(thisArg, args);
      }
      else if (!maxTimeoutId) {
        maxTimeoutId = setTimeout(maxDelayed, remaining);
      }
    }
    if (isCalled && timeoutId) {
      timeoutId = clearTimeout(timeoutId);
    }
    else if (!timeoutId && wait !== maxWait) {
      timeoutId = setTimeout(delayed, wait);
    }
    if (leadingCall) {
      isCalled = true;
      result = func.apply(thisArg, args);
    }
    if (isCalled && !timeoutId && !maxTimeoutId) {
      args = thisArg = undefined;
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8 which returns 'object' for typed array constructors, and
  // PhantomJS 1.9 which returns 'function' for `NodeList` instances.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3);
 * // => 3
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3');
 * // => 3
 */
function toNumber(value) {
  if (isObject(value)) {
    var other = isFunction(value.valueOf) ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = debounce;

},{}],6:[function(require,module,exports){
/* eslint-disable no-unused-vars */
'use strict';
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

module.exports = Object.assign || function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (Object.getOwnPropertySymbols) {
			symbols = Object.getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],7:[function(require,module,exports){
'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var InfiniteComputer = require('./infiniteComputer.js'),
    bs = require('../utils/binaryIndexSearch.js');

var ArrayInfiniteComputer = (function (_InfiniteComputer) {
  _inherits(ArrayInfiniteComputer, _InfiniteComputer);

  function ArrayInfiniteComputer(heightData, numberOfChildren) {
    _classCallCheck(this, ArrayInfiniteComputer);

    _get(Object.getPrototypeOf(ArrayInfiniteComputer.prototype), 'constructor', this).call(this, heightData, numberOfChildren);
    this.prefixHeightData = this.heightData.reduce(function (acc, next) {
      if (acc.length === 0) {
        return [next];
      } else {
        acc.push(acc[acc.length - 1] + next);
        return acc;
      }
    }, []);
  }

  _createClass(ArrayInfiniteComputer, [{
    key: 'maybeIndexToIndex',
    value: function maybeIndexToIndex(index) {
      if (typeof index === 'undefined' || index === null) {
        return this.prefixHeightData.length - 1;
      } else {
        return index;
      }
    }
  }, {
    key: 'getTotalScrollableHeight',
    value: function getTotalScrollableHeight() {
      var length = this.prefixHeightData.length;
      return length === 0 ? 0 : this.prefixHeightData[length - 1];
    }
  }, {
    key: 'getDisplayIndexStart',
    value: function getDisplayIndexStart(windowTop) {
      var foundIndex = bs.binaryIndexSearch(this.prefixHeightData, windowTop, bs.opts.CLOSEST_HIGHER);
      return this.maybeIndexToIndex(foundIndex);
    }
  }, {
    key: 'getDisplayIndexEnd',
    value: function getDisplayIndexEnd(windowBottom) {
      var foundIndex = bs.binaryIndexSearch(this.prefixHeightData, windowBottom, bs.opts.CLOSEST_HIGHER);
      return this.maybeIndexToIndex(foundIndex);
    }
  }, {
    key: 'getTopSpacerHeight',
    value: function getTopSpacerHeight(displayIndexStart) {
      var previous = displayIndexStart - 1;
      return previous < 0 ? 0 : this.prefixHeightData[previous];
    }
  }, {
    key: 'getBottomSpacerHeight',
    value: function getBottomSpacerHeight(displayIndexEnd) {
      if (displayIndexEnd === -1) {
        return 0;
      }
      return this.getTotalScrollableHeight() - this.prefixHeightData[displayIndexEnd];
    }
  }]);

  return ArrayInfiniteComputer;
})(InfiniteComputer);

module.exports = ArrayInfiniteComputer;

},{"../utils/binaryIndexSearch.js":10,"./infiniteComputer.js":9}],8:[function(require,module,exports){
'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var InfiniteComputer = require('./infiniteComputer.js');

var ConstantInfiniteComputer = (function (_InfiniteComputer) {
  _inherits(ConstantInfiniteComputer, _InfiniteComputer);

  function ConstantInfiniteComputer() {
    _classCallCheck(this, ConstantInfiniteComputer);

    _get(Object.getPrototypeOf(ConstantInfiniteComputer.prototype), 'constructor', this).apply(this, arguments);
  }

  _createClass(ConstantInfiniteComputer, [{
    key: 'getTotalScrollableHeight',
    value: function getTotalScrollableHeight() {
      return this.heightData * this.numberOfChildren;
    }
  }, {
    key: 'getDisplayIndexStart',
    value: function getDisplayIndexStart(windowTop) {
      return Math.floor(windowTop / this.heightData);
    }
  }, {
    key: 'getDisplayIndexEnd',
    value: function getDisplayIndexEnd(windowBottom) {
      var nonZeroIndex = Math.ceil(windowBottom / this.heightData);
      if (nonZeroIndex > 0) {
        return nonZeroIndex - 1;
      }
      return nonZeroIndex;
    }
  }, {
    key: 'getTopSpacerHeight',
    value: function getTopSpacerHeight(displayIndexStart) {
      return displayIndexStart * this.heightData;
    }
  }, {
    key: 'getBottomSpacerHeight',
    value: function getBottomSpacerHeight(displayIndexEnd) {
      var nonZeroIndex = displayIndexEnd + 1;
      return Math.max(0, (this.numberOfChildren - nonZeroIndex) * this.heightData);
    }
  }]);

  return ConstantInfiniteComputer;
})(InfiniteComputer);

module.exports = ConstantInfiniteComputer;

},{"./infiniteComputer.js":9}],9:[function(require,module,exports){
// An infinite computer must be able to do the following things:
//  1. getTotalScrollableHeight()
//  2. getDisplayIndexStart()
//  3. getDisplayIndexEnd()

'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var InfiniteComputer = (function () {
  function InfiniteComputer(heightData, numberOfChildren) {
    _classCallCheck(this, InfiniteComputer);

    this.heightData = heightData;
    this.numberOfChildren = numberOfChildren;
  }

  _createClass(InfiniteComputer, [{
    key: 'getTotalScrollableHeight',
    value: function getTotalScrollableHeight() {
      if ("development" === 'development') {
        throw new Error('getTotalScrollableHeight not implemented.');
      }
    }

    /* eslint-disable no-unused-vars */
  }, {
    key: 'getDisplayIndexStart',
    value: function getDisplayIndexStart(windowTop) {
      /* eslint-enable no-unused-vars */
      if ("development" === 'development') {
        throw new Error('getDisplayIndexStart not implemented.');
      }
    }

    /* eslint-disable no-unused-vars */
  }, {
    key: 'getDisplayIndexEnd',
    value: function getDisplayIndexEnd(windowBottom) {
      /* eslint-enable no-unused-vars */
      if ("development" === 'development') {
        throw new Error('getDisplayIndexEnd not implemented.');
      }
    }

    // These are helper methods, and can be calculated from
    // the above details.
    /* eslint-disable no-unused-vars */
  }, {
    key: 'getTopSpacerHeight',
    value: function getTopSpacerHeight(displayIndexStart) {
      /* eslint-enable no-unused-vars */
      if ("development" === 'development') {
        throw new Error('getTopSpacerHeight not implemented.');
      }
    }

    /* eslint-disable no-unused-vars */
  }, {
    key: 'getBottomSpacerHeight',
    value: function getBottomSpacerHeight(displayIndexEnd) {
      /* eslint-enable no-unused-vars */
      if ("development" === 'development') {
        throw new Error('getBottomSpacerHeight not implemented.');
      }
    }
  }]);

  return InfiniteComputer;
})();

module.exports = InfiniteComputer;

},{}],10:[function(require,module,exports){
"use strict";

var opts = {
  CLOSEST_LOWER: 1,
  CLOSEST_HIGHER: 2
};

var binaryIndexSearch = function binaryIndexSearch(array, /* : Array<number> */
item, /* : number */
opt /* : number */) /* : ?number */{
  var index;

  var high = array.length - 1,
      low = 0,
      middle,
      middleItem;

  while (low <= high) {
    middle = low + Math.floor((high - low) / 2);
    middleItem = array[middle];

    if (middleItem === item) {
      return middle;
    } else if (middleItem < item) {
      low = middle + 1;
    } else if (middleItem > item) {
      high = middle - 1;
    }
  }

  if (opt === opts.CLOSEST_LOWER && low > 0) {
    index = low - 1;
  } else if (opt === opts.CLOSEST_HIGHER && high < array.length - 1) {
    index = high + 1;
  }

  return index;
};

module.exports = {
  binaryIndexSearch: binaryIndexSearch,
  opts: opts
};

},{}],11:[function(require,module,exports){
(function (global){
// This module provides a centralized place for
// runtime checking that the props passed to React Infinite
// make the minimum amount of sense.

'use strict';

var React = global.React || require('react');
var _isFinite = require('lodash.isfinite');

module.exports = function (props) {
  var rie = 'Invariant Violation: ';
  if (!(props.containerHeight || props.useWindowAsScrollContainer)) {
    throw new Error(rie + 'Either containerHeight or useWindowAsScrollContainer must be provided.');
  }

  if (!(_isFinite(props.elementHeight) || Array.isArray(props.elementHeight))) {
    throw new Error(rie + 'You must provide either a number or an array of numbers as the elementHeight.');
  }

  if (Array.isArray(props.elementHeight)) {
    if (React.Children.count(props.children) !== props.elementHeight.length) {
      throw new Error(rie + 'There must be as many values provided in the elementHeight prop as there are children.');
    }
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash.isfinite":3,"react":undefined}],12:[function(require,module,exports){
/*
  A number of polyfills for native functions are consolidated
  here. We do this instead of using the libraries directly
  because Flow is designed to make its type refinements
  with these native functions.
 */

'use strict';

if (!Object.assign) {
  Object.assign = require('object-assign');
}

if (!Array.isArray) {
  Array.isArray = require('lodash.isarray');
}

},{"lodash.isarray":2,"object-assign":6}],13:[function(require,module,exports){
(function (global){
'use strict';

var ConstantInfiniteComputer = require('../computers/constantInfiniteComputer.js');
var ArrayInfiniteComputer = require('../computers/arrayInfiniteComputer.js');
var React = global.React || require('react');

function createInfiniteComputer(data, cursor) {
  var computer;
  var numberOfChildren = cursor.count();

  // This should be guaranteed by checkProps
  if (Array.isArray(data)) {
    computer = new ArrayInfiniteComputer(data, numberOfChildren);
  } else {
    computer = new ConstantInfiniteComputer(data, numberOfChildren);
  }
  return computer;
}

// Given the scrollTop of the container, computes the state the
// component should be in. The goal is to abstract all of this
// from any actual representation in the DOM.
// The window is the block with any preloadAdditionalHeight
// added to it.
function recomputeApertureStateFromOptionsAndScrollTop(_ref, scrollTop) {
  var preloadBatchSize = _ref.preloadBatchSize;
  var preloadAdditionalHeight = _ref.preloadAdditionalHeight;
  var infiniteComputer = _ref.infiniteComputer;
  return (function () {
    var blockNumber = preloadBatchSize === 0 ? 0 : Math.floor(scrollTop / preloadBatchSize),
        blockStart = preloadBatchSize * blockNumber,
        blockEnd = blockStart + preloadBatchSize,
        apertureTop = Math.max(0, blockStart - preloadAdditionalHeight),
        apertureBottom = Math.min(infiniteComputer.getTotalScrollableHeight(), blockEnd + preloadAdditionalHeight);

    return {
      displayIndexStart: infiniteComputer.getDisplayIndexStart(apertureTop),
      displayIndexEnd: infiniteComputer.getDisplayIndexEnd(apertureBottom)
    };
  })();
}

module.exports = {
  createInfiniteComputer: createInfiniteComputer,
  recomputeApertureStateFromOptionsAndScrollTop: recomputeApertureStateFromOptionsAndScrollTop
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../computers/arrayInfiniteComputer.js":7,"../computers/constantInfiniteComputer.js":8,"react":undefined}],14:[function(require,module,exports){
'use strict';

module.exports = {
  CONTAINER_HEIGHT_SCALE_FACTOR: 'containerHeightScaleFactor'
};

},{}],15:[function(require,module,exports){
(function (global){
'use strict';

var React = global.React || require('react');

module.exports = {
  preloadType: React.PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.shape({
    type: React.PropTypes.oneOf(['containerHeightScaleFactor']).isRequired,
    amount: React.PropTypes.number.isRequired
  })])
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"react":undefined}]},{},[1])(1)
});
//# sourceMappingURL=react-infinite.js.map
