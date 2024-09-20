export const schema = {
    body: {
		type: 'object',
		properties: {
			reference: {
				type: "object",
				properties: {
					collection_name: {type: "string"},
					collection_type: {
                        enum: ['archaeological','biostratigraphic','paleoecologic','taphonomic','taxonomic','general faunal/floral'],
                    },
					reference_no: {type: "integer"},
					access_level: {
                        enum: ['the public','database members','group members','authorizer only'],
                        default: "the public"
                    },
					release_date: {type: "string"},
					country: {type: "string"},
					state: {type: "string"},
					lat: {type: "number"},
					lng: {type: "number"},
					max_interval_no: {type: "integer"},
					lithology1: {
						enum: ['not reported','"siliciclastic"','claystone','mudstone','"shale"','siltstone','sandstone','gravel','conglomerate','breccia','"mixed carbonate-siliciclastic"','marl','lime mudstone','chalk','travertine','wackestone','packstone','grainstone','"reef rocks"','floatstone','rudstone','bafflestone','bindstone','framestone','"limestone"','dolomite','"carbonate"','calcareous ooze','chert','diatomite','silicious ooze','radiolarite','amber','coal','peat','lignite','subbituminous coal','bituminous coal','anthracite','coal ball','tar','evaporite','gypsum','phosphorite','pyrite','ironstone','siderite','phyllite','slate','schist','quartzite','"volcaniclastic"','ash','tuff'],
						default: "English"
					},
					environment: {
                        enum: ['marine indet.','terrestrial indet.','carbonate indet.','peritidal','shallow subtidal indet.','open shallow subtidal','lagoonal/restricted shallow subtidal','sand shoal','reef, buildup or bioherm','perireef or subreef','intrashelf/intraplatform reef','platform/shelf-margin reef','slope/ramp reef','basin reef','deep subtidal ramp','deep subtidal shelf','deep subtidal indet.','offshore ramp','offshore shelf','offshore indet.','slope','basinal (carbonate)','basinal (siliceous)','marginal marine indet.','paralic indet.','lagoonal','coastal indet.','foreshore','shoreface','transition zone/lower shoreface','offshore','deltaic indet.','delta plain','interdistributary bay','delta front','prodelta','deep-water indet.','submarine fan','basinal (siliciclastic)','fluvial-lacustrine indet.','fluvial indet.','"channel"','channel lag','coarse channel fill','fine channel fill','"floodplain"','wet floodplain','dry floodplain','levee','crevasse splay','lacustrine indet.','lacustrine - large','lacustrine - small','pond','crater lake','karst indet.','fissure fill','cave','sinkhole','eolian indet.','dune','interdune','loess','fluvial-deltaic indet.','estuary/bay','lacustrine deltaic indet.','lacustrine delta plain','lacustrine interdistributary bay','lacustrine delta front','lacustrine prodelta','alluvial fan','glacial','mire/swamp','spring','tar']
                    },
					pres_mode: {
						enum: ['body','cast','mold/impression','adpression','trace','concretion','soft parts','recrystallized','permineralized','dissolution traces','charcoalification','coalified','original aragonite','original calcite','original phosphate','original silica','original chitin','original carbon','original sporopollenin','original cellulose','replaced with calcite','replaced with dolomite','replaced with silica','replaced with pyrite','replaced with siderite','replaced with hematite','replaced with limonite','replaced with phosphate','replaced with carbon','replaced with other','amber','anthropogenic','bone collector','coquina','coprolite','midden','shellbed']
					},
				},
				required: [
                    "reference_no",
                    "access_level",
                    "release_date",
                    "collection_name",
                    "collection_type",
                    "country",
                    "state",
                    "lat",
                    "lng",
                    "max_interval_no",
                    "lithology1",
                    "environment",
                    "pres_mode"
                ],
			}
      	}
    }
}