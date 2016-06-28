/* @flow */

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
    elementHeight: React.PropTypes.oneOfType([
      React.PropTypes.number,
      React.PropTypes.arrayOf(React.PropTypes.number)
    ]).isRequired,
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

    // Custom implementation
    // For redux, we take a single state object
    // 1) Create all children before rendering
    // 2) Use unique keys for each child
    list: React.PropTypes.object,

    childRender: React.PropTypes.func.isRequired
  },
  statics: {
    containerHeightScaleFactor(factor) {
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

  getDefaultProps(): ReactInfiniteProvidedDefaultProps {
    return {
      handleScroll: () => {},

      useWindowAsScrollContainer: false,

      onInfiniteLoad: () => {},
      loadingSpinnerDelegate: <div/>,

      displayBottomUpwards: false,

      isInfiniteLoading: false,
      timeScrollStateLastsForAfterUserScrolls: 150,

      className: '',

      //Custom impl
      state: []
    };
  },

  // automatic adjust to scroll direction
  // give spinner a ReactCSSTransitionGroup
  getInitialState() {
    var nextInternalState = this.recomputeInternalStateFromProps(this.props);

    this.computedProps = nextInternalState.computedProps;
    this.utils = nextInternalState.utils;
    this.shouldAttachToBottom = this.props.displayBottomUpwards;

    var state = nextInternalState.newState;
    state.scrollTimeout = undefined;
    state.isScrolling = false;

    return state;
  },

  generateComputedProps(props: ReactInfiniteProps): ReactInfiniteComputedProps {
    // These are extracted so their type definitions do not conflict.
    var {containerHeight,
          preloadBatchSize,
          preloadAdditionalHeight,
          ...oldProps} = props;

    var newProps = {};
    containerHeight = typeof containerHeight === 'number' ? containerHeight : 0;
    newProps.containerHeight = props.useWindowAsScrollContainer
      ? window.innerHeight : containerHeight;

    if (oldProps.infiniteLoadBeginBottomOffset !== undefined) {
      newProps.infiniteLoadBeginEdgeOffset = oldProps.infiniteLoadBeginBottomOffset;
      if (!this.deprecationWarned) {
        console.error(`Warning: React Infinite's infiniteLoadBeginBottomOffset prop
        has been deprecated as of 0.6.0. Please use infiniteLoadBeginEdgeOffset.
        Because this is a rather descriptive name, a simple find and replace
        should suffice.`);
        this.deprecationWarned = true;
      }
    }

    var defaultPreloadBatchSizeScaling = {
      type: scaleEnum.CONTAINER_HEIGHT_SCALE_FACTOR,
      amount: 0.5
    };
    var batchSize = preloadBatchSize && preloadBatchSize.type
      ? preloadBatchSize
      : defaultPreloadBatchSizeScaling;

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
    var additionalHeight = preloadAdditionalHeight && preloadAdditionalHeight.type
      ? preloadAdditionalHeight
      : defaultPreloadAdditionalHeightScaling;
    if (typeof preloadAdditionalHeight === 'number') {
      newProps.preloadAdditionalHeight = preloadAdditionalHeight;
    } else if (additionalHeight.type === scaleEnum.CONTAINER_HEIGHT_SCALE_FACTOR) {
      newProps.preloadAdditionalHeight = newProps.containerHeight * additionalHeight.amount;
    } else {
      newProps.preloadAdditionalHeight = 0;
    }

    return Object.assign(oldProps, newProps);
  },

  generateComputedUtilityFunctions(props: ReactInfiniteProps): ReactInfiniteUtilityFunctions {
    var utilities = {};
    utilities.getLoadingSpinnerHeight = () => {
      var loadingSpinnerHeight = 0;
      if (this.refs && this.refs.loadingSpinner) {
        var loadingSpinnerNode = ReactDOM.findDOMNode(this.refs.loadingSpinner);
        loadingSpinnerHeight = loadingSpinnerNode.offsetHeight || 0;
      }
      return loadingSpinnerHeight;
    };
    if (props.useWindowAsScrollContainer) {
      utilities.subscribeToScrollListener = () => {
        window.addEventListener('scroll', this.infiniteHandleScroll);
      };
      utilities.unsubscribeFromScrollListener = () => {
        window.removeEventListener('scroll', this.infiniteHandleScroll);
      };
      utilities.nodeScrollListener = () => {};
      utilities.getScrollTop = () => window.pageYOffset;
      utilities.setScrollTop = (top) => {
        window.scroll(window.pageXOffset, top);
      };
      utilities.scrollShouldBeIgnored = () => false;
      utilities.buildScrollableStyle = () => ({});
    } else {
      utilities.subscribeToScrollListener = () => {};
      utilities.unsubscribeFromScrollListener = () => {};
      utilities.nodeScrollListener = this.infiniteHandleScroll;
      utilities.getScrollTop = () => {
        var scrollable;
        if (this.refs && this.refs.scrollable) {
          scrollable = ReactDOM.findDOMNode(this.refs.scrollable);
        }
        return scrollable ? scrollable.scrollTop : 0;
      };

      utilities.setScrollTop = (top) => {
        var scrollable;
        if (this.refs && this.refs.scrollable) {
          scrollable = ReactDOM.findDOMNode(this.refs.scrollable);
        }
        if (scrollable) {
          scrollable.scrollTop = top;
        }
      };
      utilities.scrollShouldBeIgnored = event => event.target !== ReactDOM.findDOMNode(this.refs.scrollable);

      utilities.buildScrollableStyle = () => {
        return {
          height: this.computedProps.containerHeight,
          overflowX: 'hidden',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch'
        };
      };
    }
    return utilities;
  },

  recomputeInternalStateFromProps(props: ReactInfiniteProps): {
    computedProps: ReactInfiniteComputedProps,
    utils: ReactInfiniteUtilityFunctions,
    newState: ReactInfiniteState
    } {
    checkProps(props);
    var computedProps = this.generateComputedProps(props);
    var utils = this.generateComputedUtilityFunctions(props);

    var newState = {};

    //Custom: take future child count from list, not children
    newState.numberOfChildren = computedProps.list.length;

    newState.infiniteComputer = infiniteHelpers.createInfiniteComputer(
      computedProps.elementHeight,
      computedProps.list,
      computedProps.displayBottomUpwards
    );

    if (computedProps.isInfiniteLoading !== undefined) {
      newState.isInfiniteLoading = computedProps.isInfiniteLoading;
    }

    newState.preloadBatchSize = computedProps.preloadBatchSize;
    newState.preloadAdditionalHeight = computedProps.preloadAdditionalHeight;

    newState = Object.assign(newState,
      infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(
        newState, utils.getScrollTop()));

    return {
      computedProps,
      utils,
      newState
    };
  },

  componentWillReceiveProps(nextProps: ReactInfiniteProps) {
    var nextInternalState = this.recomputeInternalStateFromProps(nextProps);

    this.computedProps = nextInternalState.computedProps;
    this.utils = nextInternalState.utils;

    this.setState(nextInternalState.newState);
  },

  componentWillUpdate() {
    if (this.props.displayBottomUpwards) {
      this.preservedScrollState = this.utils.getScrollTop() - this.loadingSpinnerHeight;
    }
  },

  componentDidUpdate(prevProps: ReactInfiniteProps, prevState: ReactInfiniteState) {
    if (this.props.displayBottomUpwards) {
      // this line was in the top of this function, moved to here for performance improvments
      this.loadingSpinnerHeight = this.utils.getLoadingSpinnerHeight();

      var lowestScrollTop = this.getLowestPossibleScrollTop();
      if (this.shouldAttachToBottom && this.utils.getScrollTop() < lowestScrollTop) {
        this.utils.setScrollTop(lowestScrollTop);
      } else if (prevProps.isInfiniteLoading && !this.props.isInfiniteLoading) {
        this.utils.setScrollTop(this.state.infiniteComputer.getTotalScrollableHeight() -
          prevState.infiniteComputer.getTotalScrollableHeight() +
          this.preservedScrollState);
      }
    }

    //Custom using list elements instead of children
    const hasLoadedMoreChildren = this.props.list.length !== prevProps.list.length;
    if (hasLoadedMoreChildren) {
      var newApertureState = infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(
        this.state,
        this.utils.getScrollTop()
      );
      this.setState(newApertureState);
    }

    const isMissingVisibleRows = hasLoadedMoreChildren && !this.hasAllVisibleItems() && !this.state.isInfiniteLoading;
    if (isMissingVisibleRows) {
      this.onInfiniteLoad();
    }
  },

  componentDidMount() {
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

  componentWillUnmount() {
    this.utils.unsubscribeFromScrollListener();
  },

  infiniteHandleScroll(e: SyntheticEvent) {
    if (this.utils.scrollShouldBeIgnored(e)) {
      return;
    }
    this.computedProps.handleScroll(ReactDOM.findDOMNode(this.refs.scrollable));
    this.handleScroll(this.utils.getScrollTop());
  },

  manageScrollTimeouts() {
    // Maintains a series of timeouts to set this.state.isScrolling
    // to be true when the element is scrolling.

    if (this.state.scrollTimeout) {
      clearTimeout(this.state.scrollTimeout);
    }

    var that = this,
        scrollTimeout = setTimeout(() => {
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

  getLowestPossibleScrollTop(): number {
    return this.state.infiniteComputer.getTotalScrollableHeight() - this.computedProps.containerHeight;
  },

  hasAllVisibleItems(): boolean {
    return !(_isFinite(this.computedProps.infiniteLoadBeginEdgeOffset) &&
        this.state.infiniteComputer.getTotalScrollableHeight() < this.computedProps.containerHeight);
  },

  passedEdgeForInfiniteScroll(scrollTop: number): boolean {
    if (this.computedProps.displayBottomUpwards) {
      return !this.shouldAttachToBottom && scrollTop < this.computedProps.infiniteLoadBeginEdgeOffset;
    } else {
      return scrollTop > this.state.infiniteComputer.getTotalScrollableHeight() -
          this.computedProps.containerHeight -
          this.computedProps.infiniteLoadBeginEdgeOffset;
    }
  },

  onInfiniteLoad() {
    this.setState({ isInfiniteLoading: true });
    this.computedProps.onInfiniteLoad();
  },

  handleScroll(scrollTop: number) {
    this.shouldAttachToBottom = this.computedProps.displayBottomUpwards &&
        scrollTop >= this.getLowestPossibleScrollTop();

    this.manageScrollTimeouts();

    var newApertureState = infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(
      this.state,
      scrollTop
    );

    if (this.passedEdgeForInfiniteScroll(scrollTop) && !this.state.isInfiniteLoading) {
      this.setState(Object.assign({}, newApertureState));
      this.onInfiniteLoad();
    } else {
      this.setState(newApertureState);
    }
  },

  buildHeightStyle(height: number): CSSStyle {
    return {
      width: '100%',
      height: Math.ceil(height)
    };
  },

  render(): ReactElement<any, any, any> {
    var displayables;

    if (this.computedProps.list.length > 1) {
      displayables = this.computedProps.list.slice(this.state.displayIndexStart,
                                                       this.state.displayIndexEnd + 1);
    } else {
      displayables = this.computedProps.list;
    }

    var displayablesRender = displayables.map((displayable, i) => {
      return this.props.childRender(displayable, i);
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

    var loadingSpinner = this.computedProps.infiniteLoadBeginEdgeOffset === undefined
      ? null
      : <div ref="loadingSpinner">
        {this.state.isInfiniteLoading ? this.computedProps.loadingSpinnerDelegate : null}
      </div>;

    var loadMore = this.props.renderLoadMore ? this.props.renderLoadMore() : null;

    // topSpacer and bottomSpacer take up the amount of space that the
    // rendered elements would have taken up otherwise
    return <div className={this.computedProps.className}
                ref="scrollable"
                style={this.utils.buildScrollableStyle()}
                onScroll={this.utils.nodeScrollListener}>
      <div ref="smoothScrollingWrapper" style={infiniteScrollStyles}>
        <div ref="topSpacer"
             style={this.buildHeightStyle(topSpacerHeight)}/>
          {this.computedProps.displayBottomUpwards && loadingSpinner}
          {displayablesRender}
          {loadMore}
          {!this.computedProps.displayBottomUpwards && loadingSpinner}
        <div ref="bottomSpacer"
             style={this.buildHeightStyle(bottomSpacerHeight)}/>
      </div>
    </div>;
  }
});

module.exports = Infinite;
global.Infinite = Infinite;
