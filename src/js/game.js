var user = prompt("What would you like you train today at the gym? Arms, Legs or Back?").toUpperCase();

switch(user) {

    case'ARMS':
        var ready = prompt("So you want arms like Popeye eh? Are you ready to build those guns? (YES or NO)").toUpperCase();
        var warmedUp = prompt("Slow down slow down. Are you warmed up first? (YES or NO)").toUpperCase();
        if (ready === 'YES' && warmedUp === 'YES') {
            alert("Which way to the gun show!");
            console.log("Which way to the gun show!");
        } else {
            alert("But don't you want that peak tho?");
            console.log("But don't you want that peak tho?");
        }
        break;

    case'LEGS':
        var warmedUp = prompt("It's leg day for sure. Don't want to pull a hammy. Are you warmed up? (YES or NO)").toUpperCase();
        var excited = prompt("Are you excited to feel the burn? (YES or NO)").toUpperCase();
        if (warmedUp === 'YES' || excited === 'YES')  {
            alert("Burn baby, Burn baby, Burn!");
            console.log("Burn baby, Burn baby, Burn!");
        } else {
            alert("Never skip leg day bro!");
            console.log("Never skip leg day bro!");
        }
        break;

    case'BACK':
        var jackedUp = prompt("Back is my favorite area to train by far. Are you jacked up? (YES or NO)").toUpperCase();
        var inBeastMode = prompt("Is your beastmode turned on? (YES or NO)").toUpperCase();
        if (jackedUp === 'YES' || inBeastMode === 'YES')  {
            alert("Rooooar like a BEAST!!!");
            console.log("Rooooar like a BEAST!!!");
        } else {
            alert("Do you even lift bro?");
            console.log("Do you even lift bro?");
        }
        break;

    default:
        alert("Do you even lift bro?!? Tough luck we're are doing a full body 3 hour workout!");
}
