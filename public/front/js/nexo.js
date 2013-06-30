//
// NeXO View by Keiichiro Ono
//

/* global Backbone */
/* global sigma */
/* global d3 */
/* global $ */

(function () {
    "use strict";

    // Configuration file for this application
    var CONFIG_FILE = "../app-config.json";

    var LABEL_LENGTH_TH = 30;

    // Color for nodes that are not selected
    var DIM_COLOR = "rgba(220,220,220,0.7)";
    var SELECTED_NODE_COLOR = "rgba(70,130,180,0.9)";
    var QUERY_NODE_COLOR = "rgb(255,94,25)";

    // Tags in the HTML document
    var ID_NODE_DETAILS = "#details";
    var ID_SUMMARY_PANEL = "#summary-panel";
    var ID_SEARCH_RESULTS = "#mainpanel";

    var DEFAULT_NETWORK = "NeXO";

    var CATEGORY_MAP = {
        bp: "Biological Process",
        cc: "Cellular Component",
        mf: "Molecular Function"
    };

    var TARGETS = {
        "Biological Process": "",
        "BP Annotation": "Name",
        "BP Definition": "Definition",
        "Cellular Component": "",
        "CC Annotation": "Name",
        "CC Definition": "Definition",
        "Molecular Function": "",
        "MF Annotation": "Name",
        "MF Definition": "Definition"
    };

    var TARGETS_GENE = {
        name: "Gene ID",
        "Assigned Genes": "Gene Name",
        "Assigned Orfs": "ORF Name",
        "SGD Gene Description": "Description"
    };

    var EMPTY_RECORD = "N/A";

    ////////////////////////////////////////////////////////////////////
    // Links to other DB
    ////////////////////////////////////////////////////////////////////
    var QUICK_GO_API = "http://www.ebi.ac.uk/QuickGO/GTerm?id=";
    var SGD_API = "http://www.yeastgenome.org/cgi-bin/locus.fpl?dbid=";

    /*
     EventHelper (Mediator): This object listens to all events.
     */
    var eventHelper = _.extend({}, Backbone.Events);

    var viewEventHelper = _.extend({}, Backbone.Events);
    /*
     Custom Events
     */
    var NETWORK_LOADED = "networkLoaded";
    var INITIALIZED = "initialized";
    var NODE_SELECTED = "nodeSelected";
    var NODES_SELECTED = "nodesSelected";
    var SEARCH_RESULT_SELECTED = "searchResultSelected";

    var NETWORK_SELECTED = "networkSelected";

    var CLEAR = "clear";

    var SIGMA_RENDERER = sigma.init(document.getElementById("sigma-canvas"));
    var sigmaInitialized = false;


    /**
     * Manager object for network views.
     *
     * @constructor
     */
    var NetworkViewManager = function () {
        this.views = {};
    };
    NetworkViewManager.prototype = {
        getNetworkView: function (viewId) {
            return this.views[viewId];
        },

        addNetworkView: function (viewId, view) {
            this.views[viewId] = view;
        }
    };

    var VIEW_MANAGER = new NetworkViewManager();


    var CyNetwork = Backbone.Model.extend({

        initialize: function () {
            this.updateURL();
            console.log("URL = " + this.url);
        },

        updateURL: function () {
            this.url = "/" + this.get("termId") + "/interactions";
        }
    });


    /*
     Sub-network view by cytoscape.js
     */
    var CyNetworkView = Backbone.View.extend({

        el: "#cy-network",

        events: {},

        render: function () {
            $("#cyjs").cytoscape(this.initSubnetworkView());
        },

        update: function (nodeId) {
            // TODO: remove dependency!
            // check current network model:
            var currentNetwork = app.model.get("currentNetwork");
            var currentNetworkName = currentNetwork.get("name");
            if (currentNetworkName !== DEFAULT_NETWORK) {
                // No need to update
                return;
            }

            if (this.model === undefined || this.model === null) {
                this.model = new CyNetwork({namespace: "nexo", termId: nodeId});
            } else {
                this.model.set("termId", nodeId);
                this.model.updateURL();
            }

            this.render();
        },

        loadData: function () {
            var self = this;
            this.model.fetch({
                success: function (data) {

                    var graph = data.attributes.graph;
                    var cy = self.model.get("cy");

                    cy.load(graph.elements,
                        cy.layout({
                            name: 'arbor',
                            liveUpdate: true, // whether to show the layout as it's running
                            maxSimulationTime: 3000, // max length in ms to run the layout
                            fit: true, // fit to viewport
                            padding: [ 30, 30, 30, 30 ], // top, right, bottom, left
                            ungrabifyWhileSimulating: false, // so you can't drag nodes during layout

                            // forces used by arbor (use arbor default on undefined)
                            repulsion: 19800,
                            stiffness: 11500,
                            friction: 0.8,
                            gravity: true,
                            fps: undefined,
                            precision: undefined,

                            // static numbers or functions that dynamically return what these
                            // values should be for each element
                            nodeMass: 9000,
                            edgeLength: 1.5,
                            stepSize: 1, // size of timestep in simulation
                            stableEnergy: function (energy) {
                                var e = energy;
                                return (e.max <= 0.5) || (e.mean <= 0.3);
                            }
                        }), function () {
                            console.log("DONE!!!!!!!!!");
                        });
                }
            });
        },

        initSubnetworkView: function () {

            var self = this;

            var options = {
                showOverlay: false,
                boxSelectionEnabled: false,
                minZoom: 0.1,
                maxZoom: 3,

                style: cytoscape.stylesheet()
                    .selector('node')
                    .css({
                        'font-family': 'Exo',
                        'font-size': 4,
                        'font-weight': 400,
                        'content': 'data(id)',
                        'text-valign': 'center',
                        'color': 'rgb(25, 25, 25)',
                        'width': 40,
                        'height': 15,
                        'border-color': 'white',
                        "background-color": "rgb(240,240,240)",
                        "shape": "ellipse"
                    })
                    .selector(':selected')
                    .css({
                        'background-color': '#400000',
                        'line-color': '#000'
                    })
                    .selector('edge')
                    .css({
                        'width': 1.2,
                        "line-color": "#cccccc",
                        "opacity": 0.8
                    }),

                elements: {
                    nodes: [],
                    edges: []
                },

                ready: function () {
                    self.model.set("cy", this);
                    self.model.set("options", options);
                    self.loadData();
                }
            };
            return options;
        }
    });


    // Network object stored as Cytoscape.js style
    var Network = Backbone.Model.extend({

        // Only for getting data from fixed file location
        urlRoot: "/front/data",

        initialize: function () {

            var networkConfig = this.get("config");
            this.id = networkConfig.networkData;

            // Data status:
            this.set({hasNetworkData: false});

            if (this.get("loadAtInit")) {
                this.loadNetworkData();
            }
        },

        loadNetworkData: function () {
            var self = this;
            // Reset the Sigma view
            SIGMA_RENDERER.emptyGraph();

            var isNetworkLoaded = self.get("hasNetworkData");

            if (isNetworkLoaded) {
                console.log("Alredy has data");
                var graph = this.get("graph");
                this.convertGraph(graph.nodes, graph.edges);
                this.trigger(NETWORK_LOADED);
            } else {
                // Feed data to network only when necessary
                this.fetch({
                    success: function (data) {
                        console.log("Downloading data");
                        self.set({hasNetworkData: true});
                        var attr = data.attributes;
                        self.convertGraph(attr.nodes, attr.edges);
                        self.trigger(NETWORK_LOADED);
                    }
                });
            }
        },


        convertGraph: function (nodes, edges) {
            var graph = {
                nodes: [],
                edges: []
            };

            var numberOfNodes = nodes.length;
            _.each(nodes, function (node) {
                var id = node.id;
                var nodeLabel = node.label;
                node.fullLabel = nodeLabel;
                // Truncate if long
                if (nodeLabel.length > LABEL_LENGTH_TH) {
                    nodeLabel = nodeLabel.substring(0, LABEL_LENGTH_TH) + "...";
                    node.label = nodeLabel;
                }
                SIGMA_RENDERER.addNode(id, node);
            });

            var idx = 0;
            _.each(edges, function (edge) {

                var source = edge.source;
                var target = edge.target;
                var label = edge.relationship;
                var weight = edge.weight;
                var edgeId = idx;


                var newEdge = {
                    "source": source,
                    "target": target,
                    "weight": weight,
                    "label": label,
                    "id": edgeId.toString()
                };
                SIGMA_RENDERER.addEdge(edgeId, source, target, newEdge);
                idx++;
            });

            // Save the data to model
            graph.nodes = nodes;
            graph.edges = edges;
            this.set({graph: graph});
        }
    });


    var Networks = Backbone.Collection.extend({
    });

    var NetworkManagerView = Backbone.View.extend({

        el: "#commands",

        events: {
            "click .popover-content .networkName": "networkSelected"
        },

        collection: Networks,

        initialize: function () {
            this.render();
        },

        render: function () {
            var trees = $("#trees");
            trees.empty();

            var listString = "<ul class='nav nav-pills nav-stacked'>";
            var treeCount = this.collection.length;
            for (var i = 0; i < treeCount; i++) {
                var network = this.collection.at(i);
                var networkName = network.get("config").name;
                console.log(networkName);
                listString += "<li class='networkName'>" + networkName + "</li>";
            }

            listString += "</ul>";
            trees.attr("data-content", listString);
        },

        networkSelected: function (e) {
            console.log(e.currentTarget.className);
            // Refresh
            $(".popover-content li").each(function () {
                $(this).removeClass("selectedNetwork");
            });

            e.currentTarget.className = e.currentTarget.className + " selectedNetwork";

            var selectedNetworkName = e.currentTarget.textContent;
            var selectedNetwork = this.collection.where({name: selectedNetworkName});
            this.collection.trigger(NETWORK_SELECTED, selectedNetwork);

            // Hide popover
            console.log("*********** Hiding POP");
            this.$el.find("#trees").popover("hide");
        }
    });

    var NetworkView = Backbone.View.extend({

        el: "#sigma-canvas",

        events: {
            "dblclick": "refresh"
        },

        initialize: function () {
            var self = this;

            console.log("View Created!!!!!!!!!!!!!!!!!!!!!!");

            if (!sigmaInitialized) {
                // Bind only once.
                sigmaInitialized = false;
                SIGMA_RENDERER.bind("upnodes", function (nodes) {
                    var selectedNodeId = nodes.content[0];
                    var selectedNode = SIGMA_RENDERER._core.graph.nodesIndex[selectedNodeId];

                    self.findPath(selectedNode);
                    self.trigger(NODE_SELECTED, selectedNodeId);
                });
            }
            self.bindCommands();

            // Render the network once its model is ready.
            eventHelper.listenToOnce(this.model, NETWORK_LOADED, _.bind(this.render, this));
        },

        render: function () {
            console.log("Rendering sigma view:");

            var networkConfig = this.model.get("config");
            var drawingProps = networkConfig.sigma.drawingProperties;
            var graphProps = networkConfig.sigma.graphProperties;
            var mouseProps = networkConfig.sigma.mouseProperties;

            SIGMA_RENDERER.
                drawingProperties(drawingProps).
                graphProperties(graphProps).
                mouseProperties(mouseProps);

            SIGMA_RENDERER.refresh();
            SIGMA_RENDERER.draw();
        },


        selectNodes: function (selectedNodes) {
            console.log(selectedNodes);

            if(selectedNodes === undefined || selectedNodes instanceof Array === false) {
                // Invalid parameter.
                return;
            }

            var targetNodes = [];
            _.each(selectedNodes, function(node) {
                var id = node.get("name");
                var sigmaNode = SIGMA_RENDERER._core.graph.nodesIndex[id];
                if (sigmaNode !== undefined) {
                    targetNodes[sigmaNode.id] = true;
                }
            });

            this.highlight(targetNodes, true);
        },

        zoomTo: function (id) {
            var lastNode = this.model.get("lastSelected");
            console.log("Last = " + lastNode);
            console.log("Zooming to " + id);
            if (lastNode != null) {
                // Clear last selection
                lastNode.color = lastNode.original_color;
                lastNode.original_color = null;
            }
            var node = SIGMA_RENDERER._core.graph.nodesIndex[id];
            node.original_color = node.color;
            node.color = QUERY_NODE_COLOR;

            SIGMA_RENDERER.position(0, 0, 1).draw();
            SIGMA_RENDERER.zoomTo(node.displayX, node.displayY, 70);
            SIGMA_RENDERER.draw(2, 2, 2);
            this.model.set("lastSelected", node);
        },


        bindCommands: function () {
            var self = this;
            var sigmaView = SIGMA_RENDERER;
            var commands = $("#commands");

            commands.find("div.z").each(function () {

                var zoomButton = $(this);
                var zoomCommand = zoomButton.attr("rel");

                zoomButton.tooltip({delay: { show: 200, hide: 100 }});

                zoomButton.click(function () {

                    if (zoomCommand === "center") {
                        // Fit to window
                        sigmaView.position(0, 0, 1).draw();
                    } else {
                        // Zoom in/out
                        var sigmaCore = sigmaView._core;
                        var ratio = 1;

                        if (zoomCommand === "in") {
                            ratio = 1.2;
                        } else if (zoomCommand === "out") {
                            ratio = 0.8;
                        }

                        sigmaView.zoomTo(
                            sigmaCore.domElements.nodes.width / 2,
                            sigmaCore.domElements.nodes.height / 2,
                            sigmaCore.mousecaptor.ratio * ratio
                        );
                    }

                });
            });

            commands.find("div.s").each(function () {

                var button = $(this);
                var command = button.attr("rel");

                button.popover({
                    html: true,
                    placement: "top"
                });

                if (command === "refresh") {
                    button.click(function () {
                        console.log("Refresh called");
                        self.refresh();
                    });
                }

            });
        },

        findPath: function (selectedNode) {
            var self = this;
            var nodeId = selectedNode.id;
            var parts = nodeId.split(":");


            var url = "/" + nodeId + "/path";
            console.log("PATH query = " + url);
            $.getJSON(url, function (path) {
                self.showPath(path);
            });
        },


        showAdditionalParents: function (sigmaView, targetNodes, node) {

            var parentIds = [];

            var queryUrl = "/nexo/" + node.id + "/parents";
            console.log("Parent query = " + queryUrl);

            $.getJSON(queryUrl, function (parents) {
                if (parents !== null && parents.length !== 0) {

                    console.log("Result = " + JSON.stringify(parents));
                    for (var i = 0; i < parents.length; i++) {
                        var parent = parents[i];

                        targetNodes[parent.name] = true;
                    }
                    this.highlight(sigmaView, targetNodes);
                }
            });
        },


        addHiddenEdges: function (pathEdges) {

            // Add hidden edge
            var edgeNames = {};
            SIGMA_RENDERER
                .iterEdges(function (edge) {
                    if (edge.label === "extra") {
                        SIGMA_RENDERER.dropEdge(edge.id);
                    } else {
                        var edgeName = edge.source + "-" + edge.target;
                        edgeNames[edgeName] = true;
                    }
                });
            this.model.set("edgeExists", edgeNames);

            var extraEdges = [];

            var numberOfEdges = pathEdges.length;
            for (var i = 0; i < numberOfEdges; i++) {

                var source = pathEdges[i].data.source;
                var target = pathEdges[i].data.target;

                var edgeName = source + "-" + target;
                if (edgeNames[edgeName]) {
                    // Skip
                } else {
                    // Edge does not exists.  Add to view
                    if (SIGMA_RENDERER._core.graph.nodesIndex[source] &&
                        SIGMA_RENDERER._core.graph.nodesIndex[target]) {

                        // Add edge
                        var newEdge = {
                            source: source,
                            target: target,
                            weight: 0.8,
                            size: 0.8,
                            label: "extra",
                            id: edgeName,
                            type: "curve",
                            attr: {
                                type: "extra"
                            }
                        };
                        SIGMA_RENDERER.addEdge(edgeName, source, target, newEdge);
                        extraEdges.push(newEdge);
                    }
                }
            }
            this.model.set("extraEdges", extraEdges);
        },

        showPath: function (path) {

            // Ignore if path data is not available.
            if (path.elements === undefined || path.elements === null) {
                return;
            }

            this.addHiddenEdges(path.elements.edges);

            // Boolean map for enable/disable nodes.
            var targetNodes = {};
            var pathNodes = path.elements.nodes;
            var startNode = {};
            for (var i = 0; i < pathNodes.length; i++) {
                var cytoscapejsNode = pathNodes[i];
                var id = cytoscapejsNode.data.id;
                var nodeType = cytoscapejsNode.data.type;
                var sigmaNode = SIGMA_RENDERER._core.graph.nodesIndex[id];
                if (sigmaNode !== null && sigmaNode !== undefined) {
                    targetNodes[sigmaNode.id] = true;
                    if (nodeType === "start") {
                        startNode = sigmaNode;
                    }
                }
            }
            this.highlight(targetNodes, false, startNode);
        },


        refresh: function () {
            SIGMA_RENDERER
                .iterEdges(function (edge) {
                    if (edge.label === "extra") {
                        SIGMA_RENDERER.dropEdge(edge.id);
                    }
                    edge.color = edge.attr.original_color;
                    edge.attr.grey = false;
                })
                .iterNodes(function (node) {
                    node.color = node.attr.original_color;
                    node.attr.grey = false;
                    node.forceLabel = false;
                });
            this.fit();
        },

        fit: function () {
            SIGMA_RENDERER.position(0, 0, 1).draw();
        },

        highlight: function (targetNodes, nodesOnly, queryNode) {

            if (nodesOnly === false) {
                SIGMA_RENDERER.iterEdges(function (edge) {
                    if (edge.color !== SELECTED_NODE_COLOR && edge.color !== DIM_COLOR) {
                        edge.attr.original_color = edge.color;
                    }
                    var sourceId = edge.source;
                    var targetId = edge.target;

                    if (targetNodes[sourceId] === undefined || targetNodes[targetId] === undefined) {
                        // Not on the path.  DIM all of those.
                        if (!edge.attr.grey) {
                            edge.color = DIM_COLOR;
                            edge.attr.grey = true;
                        }
                    } else if (edge.label === "extra") {
                        edge.color = "rgba(255,94,25,0.7)";
                        edge.attr.grey = false;
                    } else {
                        edge.color = SELECTED_NODE_COLOR;
                        edge.attr.grey = false;
                    }
                });
            } else {
                SIGMA_RENDERER.iterEdges(function (edge) {
                    if (edge.color !== SELECTED_NODE_COLOR && edge.color !== DIM_COLOR) {
                        edge.attr.original_color = edge.color;
                    }

                    edge.color = DIM_COLOR;
                    edge.attr.grey = true;

                });
            }

            SIGMA_RENDERER.iterNodes(function (node) {
                if (node.color !== SELECTED_NODE_COLOR && node.color !== DIM_COLOR
                    && node.color !== QUERY_NODE_COLOR) {
                    node.attr.original_color = node.color;
                }

                if (queryNode !== undefined && node.id === queryNode.id) {
                    node.color = QUERY_NODE_COLOR;
                    node.attr.grey = false;
                    node.forceLabel = true;
                } else if (!targetNodes[node.id]) {
                    node.color = DIM_COLOR;
                    node.attr.grey = true;
                    node.forceLabel = false;
                } else {
                    node.color = SELECTED_NODE_COLOR;
                    node.attr.grey = false;
                    node.forceLabel = true;
                }
            }).draw(2, 2, 2);
        }
    });


    // Application configuration
    var NexoAppModel = Backbone.Model.extend({

        initialize: function () {
            var self = this;
            $.getJSON(self.get("settingFileLocation"), function (configObject) {
                self.set("appConfig", configObject);
                var networkManager = new Networks();
                self.set("networkManager", networkManager);

                // Load networks
                self.loadNetworkSettings();

                // Fire event: Application is ready to use.
                self.trigger(INITIALIZED);
            });
        },

        loadNetworkSettings: function () {
            var networks = this.get("appConfig").networks;

            var nexoTree = {};
            for (var i = 0; i < networks.length; i++) {
                var network = networks[i];
                var tree = {};
                if (network.name === DEFAULT_NETWORK) {

                    tree = new Network({name: network.name, config: network, loadAtInit: true});
                    nexoTree = tree;
                } else {

                    tree = new Network({name: network.name, config: network, loadAtInit: false});
                }
                this.get("networkManager").add(tree);
            }

            // Initialize NeXO view only.
            $("#network-title").html(nexoTree.get("name"));
            var nexoView = new NetworkView({model: nexoTree});
            VIEW_MANAGER.addNetworkView(nexoTree.get("name"), nexoView);

            // Set current
            this.set("currentNetwork", nexoTree);
            this.set("currentNetworkView", nexoView);
        },

        loadNetworkDataFile: function (targetNetwork) {

            console.log(targetNetwork);
            var network = targetNetwork[0];
            var networkName = network.get("name");
            console.log("GOT Network Selected ===> " + networkName);
            var networkView = VIEW_MANAGER.getNetworkView(networkName);

            console.log(networkView);

            network.loadNetworkData();
            if (networkView === undefined || networkView === null) {
                console.log("Need to create view ===> " + networkName);
                networkView = new NetworkView({model: network});
                VIEW_MANAGER.addNetworkView(networkName, networkView);
            }

            networkView.render();

            $("#network-title").html(networkName);

            // Set current
            this.set("currentNetwork", network);
            this.set({currentNetworkView: networkView});
        }
    });


    // Bootstrapping the app
    var Nexo = Backbone.View.extend({

        el: "body",

        initialize: function () {
            var self = this;
            this.model = new NexoAppModel({settingFileLocation: CONFIG_FILE});

            // Initialize sub components of this view
            var searchView = new SearchResultTableView({el: $(ID_SEARCH_RESULTS)});
            var summaryView = new NodeDetailsView();
            var subNetworkView = new CyNetworkView();

            this.model.set({
                searchView: searchView,
                summaryView: summaryView,
                subNetworkView: subNetworkView
            });

            this.listenToOnce(this.model, INITIALIZED, function () {

                var currentNetworkView = self.model.get("currentNetworkView");

                viewEventHelper.listenTo(searchView.collection, NODES_SELECTED, _.bind(currentNetworkView.selectNodes, currentNetworkView));
                viewEventHelper.listenTo(searchView.collection, SEARCH_RESULT_SELECTED, _.bind(currentNetworkView.zoomTo, currentNetworkView));

                viewEventHelper.listenTo(currentNetworkView, NODE_SELECTED, _.bind(summaryView.show, summaryView));
                viewEventHelper.listenTo(currentNetworkView, NODE_SELECTED, _.bind(summaryView.model.getDetails, summaryView.model));

                // Update subnetwork view when a term is selected.
                viewEventHelper.listenTo(currentNetworkView, NODE_SELECTED, _.bind(subNetworkView.update, subNetworkView));

                viewEventHelper.listenTo(searchView, CLEAR, _.bind(currentNetworkView.refresh, currentNetworkView));

                eventHelper.listenTo(searchView, CLEAR, _.bind(summaryView.hide, summaryView));

                // Network collection manager
                var networkCollection = self.model.get("networkManager");
                var networkManagerView = new NetworkManagerView({collection: networkCollection});
                eventHelper.listenTo(networkCollection, NETWORK_SELECTED, _.bind(self.model.loadNetworkDataFile, self.model));

                // Listening to the current network view change event.
                self.listenTo(self.model, "change:currentNetworkView", self.networkViewSwitched);
                console.log(self);
            });
        },

        networkViewSwitched: function () {
            var currentNetworkView = this.model.get("currentNetworkView");
            console.log(currentNetworkView);

            this.updateListeners(currentNetworkView);
        },

        updateListeners: function (currentNetworkView) {
            var summaryView = this.model.get("summaryView");
            var subNetworkView = this.model.get("subNetworkView");
            var searchView = this.model.get("searchView");

            viewEventHelper.stopListening();

            viewEventHelper.listenTo(searchView.collection, NODES_SELECTED, _.bind(currentNetworkView.selectNodes, currentNetworkView));
            viewEventHelper.listenTo(searchView.collection, SEARCH_RESULT_SELECTED, _.bind(currentNetworkView.zoomTo, currentNetworkView));

            viewEventHelper.listenTo(currentNetworkView, NODE_SELECTED, _.bind(summaryView.show, summaryView));
            viewEventHelper.listenTo(currentNetworkView, NODE_SELECTED, _.bind(summaryView.model.getDetails, summaryView.model));

            // Update subnetwork view when a term is selected.
            viewEventHelper.listenTo(currentNetworkView, NODE_SELECTED, _.bind(subNetworkView.update, subNetworkView));
            viewEventHelper.listenTo(searchView, CLEAR, _.bind(currentNetworkView.refresh, currentNetworkView));
        }

    });

    var SearchResultModel = Backbone.Model.extend({

    });
    var SearchResults = Backbone.Collection.extend({

        comparator: function (model) {
            return model.get("id");
        }
    });
    /*
     A row in the search result table.
     */
    var SearchView = Backbone.View.extend({

        render: function (query) {
            var self = this;

            var name = this.model.get("name");
            var label = this.model.get("label");
            var hits = {};
            _.each(this.model.keys(), function (key) {
                var value = self.model.get(key);
                if (value !== undefined && value !== "" && key !== "label") {
                    _.each(query, function (qVal) {
                        var original = value.toString();
                        var newValue = original.toLocaleLowerCase();
                        var location = newValue.indexOf(qVal.toLowerCase());
                        if (location !== -1) {
                            var len = original.length;
                            var start = 0;
                            var last = len;

                            if (location > 20) {
                                start = location - 20;
                            }

                            if (len - location > 20) {
                                last = location + 20;
                            }

                            var finalText = "";
                            if (start !== 0) {
                                finalText += "... ";
                            }

                            finalText += original.substring(start, last);

                            if (last != len) {
                                finalText += "..."
                            }

                            hits[key] = finalText;
                        }
                    });
//                    console.log(hits);
//                    console.log(query);
                }
            });


            var newRow = "<tr><td>" + name + "</td><td>" + label + "</td><td style='width: 190px'><ul>";
            _.each(_.keys(hits), function (key) {
                newRow += "<li>" + hits[key] + "</li>";
            });

            newRow += "</ul></td></tr>";
            this.$el.append(newRow);
            return this;
        }
    });


    /*
     Search result table
     */
    var SearchResultTableView = Backbone.View.extend({

        el: ID_SEARCH_RESULTS,

        isDisplay: false,

        events: {
            "click #search-button": "searchButtonPressed",
            "click #clear-button": "clearButtonPressed",
            "click #help-button": "helpButtonPressed",
            "keypress #query": "searchDatabase",
            "click .radio": "searchModeChanged"
        },

        initialize: function () {
            var self = this;

            this.collection = new SearchResults();
            var tableObject = $("#result-table");
            tableObject.find("tr").live("click", function () {
                tableObject.find("tr").each(function () {
                    $(this).removeClass("selected");
                });
                $(this).addClass("selected");
                var id = $(this).children("td")[0].firstChild.nodeValue;
                self.collection.trigger(SEARCH_RESULT_SELECTED, id);
            });

            tableObject.hide();
        },

        searchModeChanged: function (mode) {
            console.log(mode);
        },


        render: function () {
            var resultTableElement = $("#result-table");
            resultTableElement.empty();

            console.log("Rendering table: " + this.collection.size());
            if (this.collection.size() === 0) {
                this.$("#result-table").append(
                    "<tr><td>" + "No Match!" + "</td></tr>").slideDown(1000, "swing");
                return;
            }

            var queryObject = this.collection.at(0);

            // This should not happen!
            if (queryObject === undefined) {
                return;
            }

            var queryArray = queryObject.get("queryArray");

            this.$("#result-table").append("<tr><th>ID</th><th>Term Name</th><th>Matches</th></tr>");
            this.collection.each(function (result) {
                if (result !== queryObject) {
                    this.renderResult(result, queryArray);
                }
            }, this);

            this.$("#result-table").show(600);

            if (this.isDisplay === false) {
                this.$el.animate({width: '+=150px'}, 'slow', 'swing');
                this.isDisplay = true;
            }
        },

        renderResult: function (result, query) {
            var resultView = new SearchView({
                model: result
            });

            var rendered = resultView.render(query);
            $("#result-table").append(rendered.$el.html());
        },

        search: function (query, searchByGenes) {
            var self = this;

            this.collection.reset();

            var searchUrl = "";
            if (searchByGenes) {
                searchUrl = "/search/genes/" + query;
            } else {
                searchUrl = "/search/" + query;
            }

            $.getJSON(searchUrl, function (searchResult) {
                if (searchResult !== undefined && searchResult.length !== 0) {
                    for (var i = 0; i < searchResult.length; i++) {
                        var node = searchResult[i];
                        self.collection.add(node);
                    }

                    self.collection.trigger(NODES_SELECTED, self.collection.models);
                }

                self.render();
            });
        },

        searchDatabase: function (event) {
            var charCode = event.charCode;

            // Enter key
            if (charCode === 13) {
                var byGenes = $("#byGenes")[0].checked;
                event.preventDefault();
                var query = $("#query").val();
                this.search(query, byGenes);
            }
        },

        searchButtonPressed: function () {
            var originalQuery = $("#query").val();
            var byGenes = $("#byGenes")[0].checked;

            // Ignore empty
            if (!originalQuery || originalQuery === "") {
                return;
            }
            // Validate input
            this.search(originalQuery, byGenes);
        },

        clearButtonPressed: function () {
            var resultTableElement = $("#result-table");

            if (this.isDisplay) {
                this.$el.animate({width: '-=150px'}, 'slow', 'swing');
                this.isDisplay = false;
            }
            resultTableElement.slideUp(500).empty();
            $("#query").val("");
            this.trigger(CLEAR);
        }
    });


    /*
     Data model for the node View.
     */
    var NodeDetails = Backbone.Model.extend({

        getDetails: function (selectedNodeId) {
            if (selectedNodeId === null || selectedNodeId === undefined) {
                //  Do nothing.
                return;
            }

            this.url = "/" + selectedNodeId;
            this.id = selectedNodeId;

            var self = this;
            this.fetch({
                success: function (data) {
                    var attr = data.attributes;
                    for (var key in attr) {
                        self.set(key, attr[key]);
                    }
                }
            });
        }
    });


    /*
     Summary view
     */
    var NodeDetailsView = Backbone.View.extend({

        el: ID_SUMMARY_PANEL,

        events: {
            "click #close-button": "hide",
            "hover #term-summary": "showHover",
            "hover #genes": "showHover",
            "hover #interactions": "showHover"
        },

        initialize: function () {
            this.model = new NodeDetails();
            this.listenTo(this.model, "change", this.render);

            this.$el.find(".float-ui").hide();
        },


        showHover: function () {
            var self = this;
            clearTimeout(t);
            this.$el.find(".float-ui").fadeIn(500);

            var t = setTimeout(function(){
                self.$el.find(".float-ui").fadeOut(500);
            }, 2000);
        },

        render: function () {

            this.$(ID_NODE_DETAILS).empty();
            this.$("#genes").empty();

            var entryId = this.model.get("name");
            if (entryId.indexOf("GO") === -1) {
                this.nexoRenderer(entryId);
            } else {
                this.goRenderer(entryId);
            }


            return this;
        },

        /*
         * Render term details for GO
         */
        goRenderer: function (id) {
            var label = this.model.get("term name");
            var description = this.model.get("def");
            var synonym = this.model.get("synonym");
            var comment = this.model.get("comment");

            var genes = this.model.get("Assigned Gene Ids");
            console.log(genes);


            if (genes !== undefined && genes.length !== 0) {


                genes = _.uniq(genes);

                var names = "";
                _.each(genes, function (gene) {
                    names += gene + " ";
                });


                // TODO set upper limit.
                $.getJSON("/search/names/" + names, null, function (list) {

                    var rows = {};
                    var geneNames = [];

                    console.log(list);
                    var genesTab = $("#genes");
                    var table = "<table class=\"table table-striped\">" +
                        "<tr><th>SGD ID</th><th>Gene Symbol</th><th>ORF</th></tr>";

                    _.each(list, function (gene) {
                        var symbol = gene["Assigned Genes"];
                        geneNames.push(symbol);
                        rows[symbol] = "<tr><td>" + gene.name + "</td><td><a href='" + SGD_API + gene.name +
                            "' target=_blank>" + symbol + "</a></td><td>"
                            + gene["Assigned Orfs"] + "</td></tr>";
                    });

                    geneNames = geneNames.sort();
                    _.each(geneNames, function (geneName) {
                        table += rows[geneName];
                    });
                    table += "</table>";
                    genesTab.append(table);

                });


            }

            this.$("#subnetwork-view").hide();
            this.$(".headertext").empty().append(label);

            var summary = "<h4><a href='" + QUICK_GO_API + id + "' target=_blank >" + id + "</a></h4>";
            summary += "<table class=\"table table-striped\"><tr><td>Description</td><td>" + description + "</td></tr>";
            summary += "<tr><td>Synonym</td><td>" + synonym + "</td></tr>";
            summary += "<tr><td>Comment</td><td>" + comment + "</td></tr>";
            summary += "</table>";


            this.$(ID_NODE_DETAILS).append(summary);
            this.$(ID_NODE_DETAILS).append("<div id='term-view'></div>");

        },

        nexoRenderer: function (id) {

            // Use CC Annotation as label, if not available, use ID.
            var label = this.model.get("CC Annotation");
            if (label === undefined || label === null || label === "") {
                label = id;
            }

            // Main title
            this.$(".headertext").empty().append(label);

            // Render raw interaction network view
            this.$("#subnetwork-view").show();

            // Setup summary table
            this.$(ID_NODE_DETAILS).append("<div id='term-summary'></div>");

            var bestAlignedGoCategory = this.model.get("Best Alignment Ontology");
            var alignedCategory = "-";
            var category = "";
            if (bestAlignedGoCategory !== "" && bestAlignedGoCategory !== null && bestAlignedGoCategory !== "None") {
                alignedCategory = CATEGORY_MAP[bestAlignedGoCategory];
                category = bestAlignedGoCategory.toUpperCase();
            }
            var alignedGo = this.model.get("Best Alignment GO Term ID");
            var robustness = this.model.get("Robustness");
            var interactionDensity = this.model.get("Interaction Density");
            var bootstrap = this.model.get("Bootstrap");

            // Render Summary Table

            var summary = "<h4>" + id + "</h4><div id='robustness'></div>";

            if (id.indexOf("S") === -1) {
                summary += "<table class='table table-striped'>";
                summary += "<tr><td>Robustness</td><td>" + robustness + "</td></tr>";
                summary += "<tr><td>Interaction Density</td><td>" + interactionDensity + "</td></tr>";
                summary += "<tr><td>Bootstrap</td><td>" + bootstrap + "</td></tr>";
                summary += "<tr><td>Best Aligned GO</td><td>" + alignedCategory + "</td></tr></table>";
                summary = this.processEntry(summary);


                this.renderGeneList(this.model.get("Assigned Genes"));
            } else {
                summary = this.processGeneEntry(summary);
            }
            summary += "</table>";


            this.$("#term-summary").append(summary).append("<div id='go-chart'></div>");

            if (id.indexOf("S") === -1) {
                this.renderSingleValueChart([robustness], "Robustness", ["Robustness"], $("#robustness"));
                this.renderScores();
            }
        },

        renderSingleValueChart: function (valueArray, title, categoryArray, domElement) {

            domElement.highcharts({
                chart: {
                    type: 'bar',
                    height: 180,
                    spacingBottom: 5,
                    spacingTop: 5,
                    backgroundColor: "rgba(255,255,255,0)"
                },

                title: {
                    text: title
                },
                xAxis: {
                    categories: categoryArray,
                    labels: {
                        style: {
                            fontSize: '12px',
                            fontFamily: 'Lato'
                        }
                    }
                },
                yAxis: {
                    min: 0,
                    title: {
                        text: 'Score'
                    }
                },
                series: [
                    {
                        data: valueArray,
                        dataLabels: {
                            enabled: true,
                            color: '#FFFFFF',
                            align: 'right',
                            x: 0,
                            y: 0,
                            style: {
                                fontSize: '12px',
                                fontFamily: 'Lato'
                            }
                        }
                    }
                ],
                plotOptions: {
                    series: {
                        pointPadding: 0,
                        groupPadding: 0,
                        borderWidth: 0,
                        pointWidth: 22
                    }
                },
                credits: {
                    enabled: false
                },
                legend: {
                    enabled: false
                }
            });
        },

        renderScores: function () {
            var bp = this.model.get("BP Score");
            var cc = this.model.get("CC Score");
            var mf = this.model.get("MF Score");

            $("#go-chart").highcharts({
                chart: {
                    type: 'bar',
                    height: 150,
                    spacingBottom: 5,
                    spacingTop: 5,
                    backgroundColor: "rgba(255,255,255,0)"
                },

                title: {
                    text: 'GO Alignment'
                },
                xAxis: {
                    categories: ['Biological Process', 'Cellular Component', 'Molecular Function'],
                    labels: {
                        style: {
                            fontSize: '12px',
                            fontFamily: 'Lato'
                        }
                    }
                },
                yAxis: {
                    min: 0,
                    max: 1.0,
                    title: {
                        text: 'Score'
                    }
                },
                series: [
                    {
                        data: [bp, cc, mf],
                        dataLabels: {
                            enabled: true,
                            color: '#FFFFFF',
                            align: 'right',
                            x: 0,
                            y: 0,
                            style: {
                                fontSize: '12px',
                                fontFamily: 'Lato'
                            }
                        }
                    }
                ],
                plotOptions: {
                    series: {
                        pointPadding: 0,
                        groupPadding: 0,
                        borderWidth: 0,
                        pointWidth: 22
                    }
                },
                credits: {
                    enabled: false
                },
                legend: {
                    enabled: false
                }
            });
        },

        renderGeneList: function (genes) {
            var genesTab = $("#genes");

            var table = "<table class=\"table table-striped\">";
            for (var i = 0; i < genes.length; i++) {
                table += "<tr><td>" + genes[i] + "</td></tr>";
            }

            table += "</table>";
            genesTab.append(table);
        },


        processEntry: function (allValues) {

            for (var tableKey in TARGETS) {
                var tableValue = this.model.get(tableKey);
                if (tableValue === null || tableValue === "" || tableValue === undefined) {
                    tableValue = EMPTY_RECORD;
                }

                if (tableKey === "Best Alignment GO Term ID" && tableValue !== EMPTY_RECORD) {
                    tableValue = "<a href='" + QUICK_GO_API + tableValue + "' target='_blank'>" + tableValue + "</a>";
                }

                if (tableKey === "Biological Process" || tableKey === "Cellular Component" || tableKey === "Molecular Function") {
                    allValues += "</table><h4>" + tableKey + "</h4><table class=\"table table-striped\">";
                } else {
                    allValues += "<tr><td style='width: 120px'>" + TARGETS[tableKey] + "</td><td>" + tableValue + "</td></tr>";
                }
            }

            return allValues;
        },

        processGeneEntry: function (allValues) {

            allValues += "<table class=\"table table-striped\">";
            for (var tableKey in TARGETS_GENE) {
                var tableValue = this.model.get(tableKey);
                if (tableValue === null || tableValue === "") {
                    tableValue = EMPTY_RECORD;
                }

                if (tableKey === "name") {
                    tableValue = "<a href='" + SGD_API + tableValue + "' target='_blank'>" + tableValue + "</a>";
                } else if (tableKey === "SGD Gene Description") {
                    var descriptionList = "<ul>";
                    var entries = tableValue.split(";");
                    for (var i = 0; i < entries.length; i++) {
                        descriptionList += "<li>" + entries[i] + "</li>";
                    }
                    descriptionList += "</ul>";
                    tableValue = descriptionList;
                }
                allValues += "<tr><td style='width: 120px'>" + TARGETS_GENE[tableKey] + "</td><td>" + tableValue + "</td></tr>";
            }

            return allValues;
        },

        show: function () {
            this.$el.show(400, "swing");
        },

        hide: function () {
            this.$el.hide(400, "swing");
        }
    });

    ////////////////// Start App /////////////////////////////////
    var app = new Nexo();

})();