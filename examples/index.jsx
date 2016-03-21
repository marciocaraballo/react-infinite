
function loadArray(start, end) {
    let dataArray = [];

    for(let i=start; i < end; i++) {
        dataArray.push(i);
    }

    return dataArray;
}

// Agregar al Infinite doc de *childRender, *cursor, *
let ListItem = React.createClass({
    getDefaultProps: function() {
        return {
            height: 50,
            lineHeight: "50px"
        }
    },
    render: function() {
        return <div className="infinite-list-item" style={
            {
                height: this.props.height,
                lineHeight: this.props.lineHeight
            }
        } key={this.props.key}>
            List Item {this.props.value}
        </div>;
    }
});

let InfiniteList = React.createClass({

    elementInfiniteLoad: function() {
        return <div className="infinite-list-item">
            Loading...
        </div>;
    },

    handleChildRender: function(value, index) {
        return (
            <ListItem index={index} value={value}/>
        );
    },

    render: function() {
        return <Infinite elementHeight={this.props.elementHeight}
                         containerHeight={this.props.containerHeight}
                         infiniteLoadBeginEdgeOffset={this.props.infiniteLoadBeginEdgeOffset}
                         timeScrollStateLastsForAfterUserScrolls={this.props.timeScrollStateLastsForAfterUserScrolls}
                         onInfiniteLoad={this.props.handleInfiniteLoad}
                         loadingSpinnerDelegate={this.elementInfiniteLoad()}
                         isInfiniteLoading={this.props.isInfiniteLoading}
                         cursor={this.props.cursor}
                         childRender={this.handleChildRender}
                         />;
    }
});

let InfiniteListStore = React.createClass({

    getInitialState: function() {
        return {
            isInfiniteLoading: false
        }
    },

    buildProps: function() {
        return {
            elementHeight: 50,
            containerHeight: 250,
            infiniteLoadBeginEdgeOffset: 200,
            timeScrollStateLastsForAfterUserScrolls: 1000,
            cursor: this.props.store.cursor(),
            handleInfiniteLoad: this.handleInfiniteLoad,
            isInfiniteLoading: this.state.isInfiniteLoading
        };
    },

    handleInfiniteLoad: function() {
        let count = this.props.store.cursor().count();

        this.setState({
            isInfiniteLoading: true
        });

        this.props.store.cursor().update(function() {
            return Immutable.fromJS(loadArray(0, count + 100));
        });

        // this has to be refactor, i have to simulate a ajax call in a best way
        setTimeout(function() {
            this.setState({
                isInfiniteLoading: false
            });
        }.bind(this), 2500);
    },

    render: function() {
        return (
            <InfiniteList {...this.buildProps()}/>
        );
    }
});

const store = immstruct('my_example_1', loadArray(0, 50));

ReactDOM.render(<InfiniteListStore store={store} />, document.getElementById('infinite-example-one'));
