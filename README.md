# QF
a quadratic funding implementation on Solana

## Quick Start
1. Setup [Solana](https://github.com/solana-labs/solana)
2. run solana-test-validator in local
2. npm install
3. cd src/program
4. cargo build-bpf
5. npm run start

## Program

there are some instructions in the program

### StartRound

Start a new round. The valut controlled by the program derrived address. If the init valut is not empty, the value will be treated as a fund in the round.

### Donate

Add more fund in a round.

### RegisterProject

Register a project to the round.

### InitVoter

You need to init a voter if you want to vote. There are different voters for different project.


### Vote

Vote to a project which you like.

### Withdraw

When a round is end, project owner can withdraw the fund they got.

### EndRound

Only owenr of round can end a round.

## Page

There is a quick frontend page in src/page

## Logic

### Vote 

```
// solana
round.area = round.area - project.area
project_area_sqrt = project.area_sqrt
new_votes_sqrt = (voter.votes+amount).sqrt()
project_area_sqrt = project_area_sqrt - voter.votes_sqrt + new_votes_sqrt
project.area = project_area_sqrt^2 // <= 改为一次方
round.area = round.area + project.area_sqrt
project.area_sqrt = project_area_sqrt
project.votes = project.votes + amount
voter.votes = voter.votes + amount
voter.votes_sqrt = new_votes_sqrt

// Solidity
round.voters[_p]++
round.voted[_p][_from] += _votes
round.votes[_p] += _votes
incArea = _votes
newArea = round.areas[_p] + incArea
round.areas[_p] = newArea
round.totalVotesCategorial[category] += incArea
if (newArea > categoryInfo.topVotes) {
    categoryInfo.topVotes = newArea;
}
minVotesProject = categoryInfo.minVotesProject;
if (minVotesProject == 0 || newArea < categoryInfo.minVotes) {
    categoryInfo.minVotes = newArea;
    categoryInfo.minVotesProject = _p;
} else if (minVotesProject == _p) {
    categoryInfo.minVotes = newArea;
}
```

### GrantsOf / process_withdraw

```
// solana
fund = round.fund
amount = project.votes
// ====== new
a = round.total_area / round.project_number 
t = round.top_area
m = round.min_area 
d = t - a + (a-m)*round.R 
if d > 0 {
    s =  (a*(R-1))/d
    if (s < 1) {
        if(votes>a) {
            amount = a + (amount - a)*s

        } else {
            amount = amount + (a - amount)*(1-s)
        }
    } 
}
// =======
amount = amount + fund * project.area / round.area
fee = amount * 5 / 100
amount = amount - fee
round.fee = round.fee + fee

// Solidity
total = round.contribution[_p];
totalVotes = round.totalVotesCategorial[category];
votes = round.areas[_p];
a = totalVotes / categoryInfo.projectNumber;
t = categoryInfo.topVotes;
m = categoryInfo.minVotes;
d = t - a + (a - m) * R;
if (d > 0) {
    uint256 s = (a * (R - 1) * UNIT) / d;
    if (s < UNIT) {
        if (votes > a) {
            votes = a + ((votes - a) * s) / UNIT;
        } else {
            votes = votes + ((a - votes) * (UNIT - s)) / UNIT;
        }
    }
}
total += votes * round.matchingPoolCategorial[category] / totalVotes;
```