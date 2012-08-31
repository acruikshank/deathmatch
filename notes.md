NOTES
=================

August 28, 2012
--------------
Viewed 52 Generations starting from scratch. 64 Organsims, 8 species.Matches take too long. Reduce the match length to 500 or 600. There is one killer species. It's fast moving snake of triangles, and it always either KOs the opponent or bashes its own head in. Another species has adapted to a long imobile snake. It either falls on or near the oppenent and does a little damage before being TKOed.Presumably this species has no capacity for movement, so the extra damage points are enough to drive it's evolution.

Most of the other species are similar to organisms found after the 5 generation. There is very little variety. They do seem to have altered slightly. Most remain very ornate. A few species never make it past the first round. I wonder if this is preventing them from receiving sufficient selection pressure to evolve (i.e. they are so far behind that small improvements in fitness fail to have any benefit). Tools to analyze a species over generations (phenotypically and genotipically) should be a high priority. 

Still no plan for speciation. Sibling species should be driven apart by competition over resources. In this simulation, resources are organisms from other species. I would like to see them alter which species they compete best against which should drive morphologic change. Perhaps they can somehow be allocated breeding spots based on which species they do best against. The way speciation is implemented is that dividing a species will force it into matches with its former siblings. This will probably the largest source of selection pressure. This will likely increse the diversity, but it will be difficult to distinguish change driven by this new source of pressure from change driven by the new genetic incompatibility.

Extinction is just as much a problem. Some species can always be expected to do miserably. If extinction is based on perfect failure, then we can expect species to go extinct all the time. One posibility would to have a small probility of extinction at the end of any generation where one of the species fails to win a single match. The gap could be filled either by spliting an existing species (which might solve the speciation issue, but reduce divesity) or generating a new random species (which would increase diversity but muddle the concept of generational age).

August 29, 2012
---------------
I increased the mutation rates and also implemented a switch that turns off rendering and speeds performs more physics calculations per second. This permits a 10 fold increase in the number of generations computed in a given time. Unfortunately, there is a bug that causes the app to crash, so the overnight tests didn't yield results. I have watched a few simulations up to 20 generations. They were much more interesting than the previous one. The creatures started off mostly immobile and gradually grew more dangerous. In one simulation, it took about 10 generations before any of the creatures really started to harm each other (there generation started off with mostly neutral flex values). Once the creatures did start attacking, there were a variety of strategies which made the contest very interesting. In another simulation, some creatures were acheiving knockouts after only 4 generations. These were snakes, and by 20 generations the snakes were dominant.

No more progress on speciation.

August 30, 2012
---------------
Fixed the Box2d bug that caused the application to crash. This allowed me run 2 experiments that got over 200 generations. One was showing very interesting creatures at about 220 generations. Both simulations seem to get less interesting after that. There are fewer leaping creatures, KOs, and hard hits. The creatures seem to be getting "fuzzier" with small parts covering their surfaces. The fuzziness might be a defensive adaptation. I'm wondering if the creatures are starting to settle into some sort of equilibrium where less risky attack behaviors are advantageous. I've seen something like this in other simulations. This would probably be anwerable if I had some way of judging competitiveness between species over time.

I'm starting to feel that producing an equal number of organisms per species in each generation is a bad idea. Unfortunately, I don't have a better solution at the moment.

If settling into a boring equilibrium is a problem, it'll likely be fixed by introducing speciation and extinction. Otherwise, we can cap evolution to x number of generations (say 100), then mix in species from other simulations.

August 31, 2012
---------------
Turns out there is another bug in Box2Dweb. Both simulations crashed after 500+ generations. Watching the simulation up to that point yielded some intersting facts. It turns out the simulation doesn't naturally regress into mediocrity. I suppose I just caught it at a boring time. There were several interesting creatures in later generations. One surprise was that there doesn't seem to be any long term stability even amongst successful forms. This may be genetic driven by a mutation rate that is too high, but it also might be adapatation by other species that drives successful species to change forms. Teasing out the difference here will be an interesting research question.

One interesting form was a long rectangle with oblong pentagons at each vertex. This creature does quite a bit of leaping and is very successful because it often lands on an opponent with the sharp side of the pentagons down. Often this is an immediate knockout.

Another interesting form was a kind of tank with a hexagon (septagon?) at it's core, rotating "wheels" on the bottom vertices and long spikes on the top vertices decorated with small hanging triangles. I noticed this creature in around the 450'th generation and tracked it and it's descendants. It was quite successful even against the creature mentioned in the previous paragraph, and it won the tournament in more than one generation. It's species, however, had a lot of variation, especially around the distribution of wheels and spikes. Most of the species would have a wheel on top or some spikes on the bottom making it much less mobile. Despite the fact that the wheels on bottom creature seemed more successful, the species did not move in that direction. Interestingly, the species did seem to coalesce, but into a creature with one wheel on the bottom and one on the top. This variant rarely made it into the semi-finals. The failure of the wheels on bottom creature could be due to a mutation rate that's too high, or perhaps due to insufficient reward for winning.

If the breeding algorithm is correct, you get these breeding combinatoins: 1:2, 1:3, 1:4, 1:5, 2:3, 2:4, 3:4, 4:5. Note that, if the 2nd and 3rd have an identical genome. If the the first has a new adaptation, we expect it to show up in a quarter of the next population. This seems reasonable, but it still might be worth looking into. It might be better to weight reproductive success on wins rather than rankings.

TODO:

1. Some way of persisting simulation.
2. Fix match pairing algorithm.
3. Discover and fix box2Dweb infinite loop.
4. Disqualify creatures with too many parts or that exceed certain bounds.
5. Look into weighting breeding algorithm by wins.
6. Info on current opponents.
7. Species analysis tools.
8. Tools to analyze competitiveness between species
9. KO bonus based on match length (shorter match = bigger bonus).
