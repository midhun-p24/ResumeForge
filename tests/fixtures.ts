import { randomUUID } from 'node:crypto';
import { emptyProfile } from '@resumeforge/contracts';
import type { AgentOutput,TaskInput } from '@resumeforge/contracts';
/** Entirely synthetic; never replace with a real person's profile. */
export function fixture():{input:TaskInput;output:AgentOutput} {
  const source=randomUUID(),metric=randomUUID();
  const profile=structuredClone(emptyProfile);
  profile.contact={name:'Alex Example',email:'alex@example.invalid',phone:'',location:'Example City',links:['https://example.invalid/portfolio']};
  profile.records=[{id:source,kind:'project',title:'Synthetic Queue Service',organization:'Example Lab',startDate:'Jan 2025',endDate:'Mar 2025',url:'',contributions:'Designed a TypeScript task queue and tested retry behavior.',technologies:['TypeScript','PostgreSQL'],accomplishments:'Reduced duplicate task processing.',metrics:[{id:metric,value:'25%',context:'Synthetic benchmark reduction in duplicate processing.'}],sourceNotes:'Synthetic fixture only.',verification:'approved',publicationStatus:'not_applicable',gpa:''}];
  const input:TaskInput={schemaVersion:1,taskId:randomUUID(),operation:'tailor',profile,job:{company:'Example Systems',title:'Software Engineer',description:'Build reliable backend systems with TypeScript and PostgreSQL. Experience with task queues is preferred.',url:'',location:'Remote',notes:''},instructions:'Use only approved synthetic facts.',priorOutput:null,revisionRequest:'',lockedBulletIds:[],lockedSectionIds:[],excludedSourceIds:[]};
  const output:AgentOutput={schemaVersion:1,analysis:{requirements:[{id:randomUUID(),category:'required',text:'TypeScript',evidence:'strong',sourceIds:[source],explanation:'Approved project uses TypeScript.'}],summary:'Supported TypeScript evidence; other requirements need review.',gaps:[],unknowns:['Work authorization not specified.'],eligibility:['Review location and work authorization.'],education:'Not specified.',experience:'Project evidence available.',tailoringPlan:['Prioritize the queue project.']},selectedSourceIds:[source],resume:{sections:[{id:randomUUID(),title:'Projects',entries:[{sourceId:source,bullets:[{id:randomUUID(),text:'Reduced duplicate task processing by 25% through a TypeScript queue.',sourceIds:[source],metricIds:[metric]}]}]}]},warnings:['Synthetic fixture; review before use.']};
  return {input,output};
}
