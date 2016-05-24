
Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
   // componentCls: 'app',
    scopeType: 'release',
    iterations:[],
    iterationPageCounter:1,
    filters:[],
    pagesize:200,
   /* items:[{
        xtype:'container',
        itemId:'stats',
        margin: 10
    },{    
        xtype:'container',
        itemId:'chart'
    }], */
    
    launch: function() {
		this.fetchIterations( this.getContext().getTimeboxScope() );
    },
    
    onTimeboxScopeChange: function(newTimeboxScope) {
		this.callParent( arguments );
		this.fetchIterations( newTimeboxScope );
	},
    
    fetchIterations:function( timeboxScope ){
        // Show loading message
        this._myMask = new Ext.LoadMask(Ext.getBody(), {msg:"Calculating...Please wait."});
        this._myMask.show();
        
        // Look for iterations that are within the release
        this.filters = [];
        var startDate = timeboxScope.record.raw.ReleaseStartDate;
        var endDate = timeboxScope.record.raw.ReleaseDate;
        var startDateFilter = Ext.create('Rally.data.wsapi.Filter', {
             property : 'StartDate',
             operator: '>=',
             value: startDate
        });
        
        var endDateFilter = Ext.create('Rally.data.wsapi.Filter', {
             property : 'StartDate',
             operator: '<',
             value: endDate
        });
        
        this.filters.push( startDateFilter );
        this.filters.push( endDateFilter );
        console.log(this.filters.toString());

		var dataScope = this.getContext().getDataContext();
		var store = Ext.create(
			'Rally.data.wsapi.Store',
			{
				model: 'Iteration',
				fetch: ['ObjectID','Name','StartDate','EndDate','PlanEstimate'],
				context: dataScope,
				pageSize: this.pagesize,
				limit:this.pagesize,
				sorters:[{
					property:'StartDate',
					direction: 'ASC'
				}]
			},
			this
        );

        this.iterations = [];
        store.addFilter(this.filters,false);
        store.loadPage(this.iterationPageCounter, {
            scope: this,
            callback: function(records, operation) {
                if(operation.wasSuccessful()) {
                    if (records.length > 0) {
                        _.each(records, function(record){
                            this.iterations.push(record.get('Name'));
                        },this);
                        console.log( this.iterations );
						this.fetchWorkItems();
                    }
                    else if(records.length === 0 && this.iterations.length === 0){
                        console.log('no records!');
                        this.showNoDataBox();   
                    }
                }
                else{
                    console.log('oh,noes!');
                }
            }
        });
    },

    fetchWorkItems:function(){
        this.artifactStore = Ext.create(
			'Rally.data.wsapi.artifact.Store',
			{
				models: ['Defect', 'DefectSuite', 'UserStory'],
				fetch: ['ObjectID','Name','FormattedID','PlanEstimate','Iteration','Tags','Feature'],
				limit: Infinity
			},
			this
        );
        
        this.iterationFilters = [];
        _.each(this.iterations, function(iteration){
            var filter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Iteration.Name',
                value: iteration
            });
            this.iterationFilters.push(filter);
			},
			this
        );
        
        var numOfIterations = this.iterationFilters.length;
        this.artifacts = new Array(numOfIterations);
        for (var i = 0; i < numOfIterations; i++) {
            this.artifacts[i] = [];
        }
       
        this.applyIterationFiltersToArtifactStore(0);
    },
    
    applyIterationFiltersToArtifactStore:function(i){
		this.artifactStore.addFilter(this.iterationFilters[i],false);
        this.artifactStore.load({
            scope: this,
            callback: function(records, operation) {
                if(operation.wasSuccessful()) {
                    //console.log('records.length',records.length);
                    _.each(records, function(record){
                        this.artifacts[i].push({
                            '_ref':record.get('_ref'),   
                            'FormattedID':record.get('FormattedID'),
                            'Name':record.get('Name'),
                            'PlanEstimate':record.get('PlanEstimate'),
                            'IterationName': record.get('Iteration')._refObjectName,
                            'IterationRef' : record.get('Iteration')._ref,
                            'Tags' : record.get('Tags'),
                            'Feature' : record.get('Feature')
                        });
                    },this);
                    this.artifactStore.clearFilter(records.length);
                    
                    //if not done, call itself for the next iteration
                    if (i < this.iterationFilters.length-1) { 
                        this.applyIterationFiltersToArtifactStore(i + 1);
                    }
                    else{
          //              this.prepareChart();
                    }
                }
            }
        });
    },
    
    prepareChart:function(){
        //console.log('artifacts', this.artifacts);
        if (this.artifacts.length > 0) {
            var series = [];
            var categories = [];
            var acceptedDuringIteration = [];
            var acceptedOutsideIteration = [];
            var notAccepted = [];
            this.artifacts = _.filter(this.artifacts,function(artifactsPerIterationName){
                return artifactsPerIterationName.length !== 0;
            });
            //console.log('filtered artifacts', this.artifacts);
            _.each(this.artifacts, function(artifactsPerIterationName){
                var pointsAcceptedDuringIteration = 0;
                var pointsAcceptedOutsideIteration = 0;
                var pointsNotAccepted = 0;
                var data = [];
                var name = artifactsPerIterationName[0].IterationName;
                categories.push(name);
                _.each(artifactsPerIterationName, function(artifact){
                    if (artifact.AcceptedDate === null) {
                        pointsNotAccepted += artifact.PlanEstimate;
                    }
                    else{
                        if ((artifact.AcceptedDate >= artifact.IterationStartDate) && (artifact.AcceptedDate <= artifact.IterationEndDate)) {
                            pointsAcceptedDuringIteration += artifact.PlanEstimate;
                        }
                        else{
                            pointsAcceptedOutsideIteration += artifact.PlanEstimate;
                        }
                    }
                });
                acceptedDuringIteration.push(pointsAcceptedDuringIteration);
                acceptedOutsideIteration.push(pointsAcceptedOutsideIteration);
                notAccepted.push(pointsNotAccepted);
            },this);
            series.push({
                name : 'Not Accepted',
                data : notAccepted
            });
            series.push({
                name : 'Accepted Outside Iteration',
                data : acceptedOutsideIteration
            });
            series.push({
                name : 'Accepted During Iteration',
                data : acceptedDuringIteration
            });
            
            //console.log('series', series);
            this.makeChart(series, categories);
        }
        else{
            this.showNoDataBox();
        }
        
    },
    makeChart:function(series, categories){
        var few = 3;
        var accepted = [];
        var numOfIterations = categories.length;
        var lastFewAccepted = [];
        var bestFewAccepted = [];
        var worstFewAccepted = [];
        
        var avgLast = 0;
        var avgBest = 0;
        var avgWorst = 0;
        var totalLast = 0;
        var totalBest = 0;
        var totalWorst = 0;
        
        
        for(var i=0; i<numOfIterations; i++){
            accepted.push(series[2].data[i]);
        }
        
        var yValues = series[2].data;
        var xValues = [];
        for(i=0; i< numOfIterations; i++){
            xValues.push(i);
        }
        
        var lr = this.calculateTrend(yValues, xValues);
        var minX = 0;
        var maxX = categories.length-1;
        
         series.push({
            name: 'Trend for Accepted During Iteration',
            type: 'line',
            data: [[minX, lr.slope * minX + lr.intercept], 
                   [maxX, lr.slope * maxX + lr.intercept]],
            marker:{enabled:false},
            enableMouseTracking: false
        });
        
        lastFewAccepted = _.last(accepted, few);
        bestFewAccepted = _.last(accepted.sort(function(a, b){return a-b;}),few);
        worstFewAccepted = _.last(accepted.sort(function(a, b){return b-a;}),few);
        
        _.each(lastFewAccepted, function(element){totalLast += element;});
        _.each(bestFewAccepted, function(element){totalBest += element;});
        _.each(worstFewAccepted, function(element){totalWorst += element;});
        
        avgLast = parseFloat((parseFloat(totalLast/few)).toFixed(2));
        avgBest = parseFloat((parseFloat(totalBest/few)).toFixed(2));
        avgWorst = parseFloat((parseFloat(totalWorst/few)).toFixed(2));
        
        
        
        Ext.ComponentQuery.query('container[itemId=stats]')[0].update('Average accepted during iteration for last 3 iterations: ' + avgLast +  '</br>' +
                                   'Average accepted during iteration for best 3 iterations: ' +  avgBest + '</br>' +
                                   'Average accepted during iteration for worst 3 iterations: '  +  avgWorst + '</br>');
        
        this._myMask.hide();
        this.down('#chart').add({
            xtype: 'rallychart',
            chartConfig: {
                chart:{
                    type: 'column',
                    zoomType: 'xy'
                },
                title:{
                    text: 'Velocity Chart'
                },
                //colors: ['#87CEEB', '#8FBC8F', '#008080'],
                //chartColors: ['#87CEEB', '#8FBC8F', '#008080'],
                xAxis: {
                    title: {
                        text: 'Iterations'
                    }
                },
                yAxis:{
                    title: {
                        text: 'Plan Estimates'
                    },
                    allowDecimals: false,
                    min : 0
                },
                plotOptions: {
                    column: {
                        stacking: 'normal'
                    }
                }
            },
                            
            chartData: {
                series: series,
                categories: categories
            }
          
        });
    },
    
    calculateTrend:function(y,x){
        var lr = {};
        var n = y.length;
        var sum_x = 0;
        var sum_y = 0;
        var sum_xy = 0;
        var sum_xx = 0;
        var sum_yy = 0;
        
        for (var i = 0; i < y.length; i++) {
            sum_x += x[i];
            sum_y += y[i];
            sum_xy += (x[i]*y[i]);
            sum_xx += (x[i]*x[i]);
            sum_yy += (y[i]*y[i]);
        }
        
        lr.slope = (n * sum_xy - sum_x * sum_y) / (n*sum_xx - sum_x * sum_x);
        lr.intercept = (sum_y - lr.slope * sum_x)/n;
        lr.r2 = Math.pow((n*sum_xy - sum_x*sum_y)/Math.sqrt((n*sum_xx-sum_x*sum_x)*(n*sum_yy-sum_y*sum_y)),2);
        
        return lr;
    },
    
    showNoDataBox:function(){
        this._myMask.hide();
        Ext.ComponentQuery.query('container[itemId=stats]')[0].update('There is no data. </br>Check if there are interations in scope and work items with PlanEstimate assigned for iterations');
    }
});