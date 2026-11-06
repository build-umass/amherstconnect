import test from 'node:test';
import assert from 'node:assert/strict';
import { StackRouter, StackActions } from '@react-navigation/routers';
import { detailsParamsForPin, mapHighlightFor, newHighlightRequestId } from '../src/services/eventDetailsView.ts';

const eventId='00000000-0000-4000-8000-000000000001';
const occurrenceId='00000000-0000-4000-8000-000000000002';
const card={id:occurrenceId,eventId,title:'Selected event',category:'Arts & Culture',date:'Dec 5',time:'1 PM',emoji:'x',location:'Selected venue',latitude:42.4,longitude:-72.5};
const options={routeNames:['MapScreen','EventDetail'],routeParamList:{},routeGetIdList:{}};
const view={...card,id:eventId,occurrenceId,status:'published',occurrenceStatus:'scheduled',officialUrl:'https://events.umass.edu',startsAt:'2026-12-05T18:00:00Z'};

test('cold Map stack accepts exact occurrence target',()=>{
 const target=mapHighlightFor(view,newHighlightRequestId());
 const router=StackRouter({initialRouteName:'MapScreen'});
 const state=router.getInitialState({...options,routeParamList:{MapScreen:target}});
 assert.equal(state.routes[0].params.highlightedOccurrenceId,occurrenceId);
 assert.equal(state.routes[0].params.highlightedEventId,eventId);
});
test('warm Map -> Details -> Map retains occurrence and refreshes request identity on reopening',()=>{
 const router=StackRouter({initialRouteName:'MapScreen'});let state=router.getInitialState(options);
 let previous;
 for(let mount=0;mount<2;mount++){
  const params=detailsParamsForPin([card],occurrenceId);
  state=router.getStateForAction(state,StackActions.push('EventDetail',params),options);
  assert.equal(state.routes[state.index].params.occurrenceId,occurrenceId);
  const target=mapHighlightFor(view,newHighlightRequestId());
  state=router.getStateForAction(state,StackActions.popTo('MapScreen',target),options);
  assert.equal(state.routes.length,1);assert.equal(state.routes[0].name,'MapScreen');
  assert.equal(state.routes[0].params.highlightedOccurrenceId,occurrenceId);
  assert.notEqual(state.routes[0].params.highlightRequestId,previous);
  previous=state.routes[0].params.highlightRequestId;
 }
});
