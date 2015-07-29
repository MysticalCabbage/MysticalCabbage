var objectAssign = require('object-assign');
var EventEmitter = require('events').EventEmitter;
var FirebaseStore = require('./FirebaseStore');
var AppDispatcher = require('../dispatcher/AppDispatcher');
var pokeFunctions = require('./ClassroomStorePokemonFunctions');
var ClassroomConstants = require('../constants/ClassroomConstants');

var CHANGE_EVENT = 'change';

var firebaseRef = FirebaseStore.getDb();

var _store = {
  list: {},
  info: {},
  today: '',
  graph: [],
  assignments: {},
  student: ""
};

var addStudent = function(newStudent){
  // add newStudent object to database and return its id
  var studentId = firebaseRef.child(
    'classes/'
    + _store.info.classId
    + '/students'
  ).push(newStudent).key();
  
  // StudentSelectionStore.addStudentToGroup(studentId);
  // because of circular dependancy with stores
  // adding student to group performed in ClassroomStore 

  // student must also be added to groups with default group 1
  firebaseRef.child(
    'classes/'
    + _store.info.classId
    + '/groups/'
    + studentId
  ).set(1);

  //setting default student/parent email to undefined
  firebaseRef.child(
    'classes/'
    + _store.info.classId
    + '/students/'
    + studentId + '/emails'
  )
};

var removeStudent = function(studentId){
  // remove student record from Firebase
  firebaseRef.child(
    'classes/'
    + _store.info.classId
    + '/students/'
    + studentId
  ).remove();

  // removing student from groups
  firebaseRef.child(
    'classes/'
    + _store.info.classId
    + '/groups/'
    + studentId
  ).remove();
};



var handleFirebaseCallbackWithCurrentDate = function(callback) {
  // Recored the current timestamp based on the Firebase server
  firebaseRef.child('timestamp')
    .set(Firebase.ServerValue.TIMESTAMP);

  firebaseRef.child('timestamp').once('value', function(snapshot){
    // Grab the timestamp stored in the database
    var current_server_time = snapshot.val();
    // Converts the timestamp into a readable string, using locale conventions (eg. 7/17/2015)
    var date = new Date(current_server_time).toLocaleDateString();
    // Replace '/' with '-' so the database recognize date as one string and sets it as the param 
    var newDate = date.replace(/\//g, '-');
    // perform a callback using the new date string
    callback(newDate)
  });
};

var markAttendance = function(data){

  var markAttendanceOnDate = function(newDate) {
    firebaseRef.child('classes/' + _store.info.classId + '/students/' + data.studentId + '/attendance/' + newDate)
      .set(data.attendance);
  };

  handleFirebaseCallbackWithCurrentDate(markAttendanceOnDate)
};

var setBehaviorHistory = function(behaviorData) {
  var setBehaviorHistoryOnDate = function(newDate) {
    firebaseRef.child('classes/' + _store.info.classId + '/students/' + behaviorData.studentId + '/behaviorHistory/')
      .child(newDate)
      .child(behaviorData.behaviorAction)
      .transaction(function(current_value){ 
        return current_value + 1;
      });
  };
  handleFirebaseCallbackWithCurrentDate(setBehaviorHistoryOnDate)
};

var behaviorClicked = function(data){
  // add the experience poinst to the student's pokemon
  pokeFunctions.addExperiencePoints(data, _store.info.classId)

  firebaseRef.child('classes/' + _store.info.classId + '/students/' + data.studentId + '/behaviorTotal/').transaction(function(current_value){
    return current_value + data.behaviorValue;
  });

  // data.behaviorAction === null when adding from Demo class
  // and this is a demo class, return and don't tally behaviorAction
  if(_store.info.isDemo && !data.behaviorAction){
    return;
  }

  setBehaviorHistory(data)

  firebaseRef.child('classes/' + _store.info.classId + '/students/' + data.studentId + '/behavior/' + data.behaviorAction).transaction(function(current_value){ 
    return current_value + 1;
  });
};

var behaviorChart = function(data){
  var total = data.total;
  var behaviors = data.chartData;
  var student = data.student;
  var chartData = [];
  for(var key in behaviors){
    newObj = {};
    if(behaviors[key] === 0){
      continue;
    } 
    newObj["label"] = key;
    newObj["value"] = Math.ceil(((behaviors[key]/total)*100) * 100)/100;
    chartData.push(newObj);
  }
  console.log('data in behavior chart', data);
  _store.graph = chartData;
  _store.student = student;
  ClassroomStore.emit(CHANGE_EVENT);
};

var initQuery = function(classId){
  firebaseRef.child('classes/'+classId).on('value', function(snapshot){
    var classData = snapshot.val();
    _store.info = classData.info;
    _store.list = classData.students || {};
    _store.assignments = classData.assignments || {};

    //this is for grabbing behaviorTotal of all students for graphs
    var students = classData.students;
    var totalCount = 0;
    var studentsArray = [];
    var totalOfStudents = {}
    for(var student in students){
      for(var behavior in students[student]["behavior"]){
        if(totalOfStudents[behavior] === undefined) totalOfStudents[behavior] = 0;
        totalCount += students[student]["behavior"][behavior];
        totalOfStudents[behavior] += students[student]["behavior"][behavior]
      }
    }
    for(var value in totalOfStudents){
      if(totalOfStudents[value] === 0) continue;
      var newObj = {};
      newObj["label"] = value;
      newObj["value"] = Math.ceil((totalOfStudents[value]/totalCount * 100)*100)/100;
      studentsArray.push(newObj);
    }
    _store.graph = studentsArray || [];

    ClassroomStore.emit(CHANGE_EVENT);

    });

  firebaseRef.child('timestamp')
    .set(Firebase.ServerValue.TIMESTAMP);

  firebaseRef.child('timestamp').once('value', function(snapshot){
    var current_server_time = snapshot.val();
    var date = new Date(current_server_time).toLocaleDateString();
    _store.today = date.replace(/\//g, '-');

    ClassroomStore.emit(CHANGE_EVENT);
  });
};

var endQuery = function(){
  firebaseRef.child('classes/'+_store.info.classId).off();

  // reset singleton store when ClassroomDashboard unmounts
  _store = {
    list: {},
    info: {},
    today: '',
    graph: [],
    assignments: {}
  };
};

var ClassroomStore = objectAssign({}, EventEmitter.prototype, {
  // Invoke the callback function (ie. the _onChange function in TeacherDashboard) whenever it hears a change event
  addChangeListener: function(cb){
    this.on(CHANGE_EVENT, cb);
  },

  removeChangeListener: function(cb){
    this.removeListener(CHANGE_EVENT, cb);
  },

  getList: function(){
    return _store.list;
  },

  getInfo: function(){
    return _store.info;
  },

  getToday: function(){
    return _store.today;
  },

  getGraph: function(){
    return _store.graph;
  },
  getStudent: function(){
    return _store.student;
  }
});


AppDispatcher.register(function(payload){
  var action = payload.action;
  switch(action.actionType){
    case ClassroomConstants.ADD_STUDENT:
      // invoke setter function above to add new student to the list
      addStudent(action.data);
      // Emit a change event
      ClassroomStore.emit(CHANGE_EVENT);
      break;
    case ClassroomConstants.REMOVE_STUDENT:
      removeStudent(action.data);
      ClassroomStore.emit(CHANGE_EVENT);
      break;
    case ClassroomConstants.BEHAVIOR_CLICKED:
      behaviorClicked(action.data);
      ClassroomStore.emit(CHANGE_EVENT);
      break;
    case ClassroomConstants.MARK_ATTENDANCE:
      markAttendance(action.data);
      ClassroomStore.emit(CHANGE_EVENT);
      break;
    case ClassroomConstants.INIT_QUERY:
      initQuery(action.data);
      break;
    case ClassroomConstants.END_QUERY:
      endQuery();
      ClassroomStore.emit(CHANGE_EVENT);
      break;
    case ClassroomConstants.GET_BEHAVIORS:
      behaviorChart(action.data);
      break;
    case ClassroomConstants.GET_NEW_POKEMON:
      pokeFunctions.getNewPokemon(action.data, _store.info.classId)
      break;
    default:
      return true;
  }
});

module.exports = ClassroomStore;

