import { Routes } from '@angular/router';
import { LandingPage } from './pages/landing-page/landing-page';
import { Docs } from './pages/docs/docs';
import { Status } from './pages/status/status';

export const routes: Routes = [
  { path: '', component: LandingPage },
  { path: 'docs', component: Docs },
  { path: 'status', component: Status },
  { path: '**', redirectTo: '' }
];
