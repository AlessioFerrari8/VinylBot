import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.html',
})
export class Navbar {
  // link per download
  readonly discordInviteUrl = 'https://discord.com/oauth2/authorize?client_id=1487848371137024222&scope=bot&permissions=3148800'
  readonly slackInviteUrl = 'https://hackclub.enterprise.slack.com/archives/C0BJLKXBQ9M'
}
