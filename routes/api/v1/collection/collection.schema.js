/*
Validation schemas in JSON Schema format. Note that fastify uses ajv (https://ajv.js.org/) for validation, which expects the schemas to be javascript objects rather than raw JSON. Consequently, property names (keys) do not require double quotes.
*/

export const patchSchema = {
    body: {
		type: "object",
		properties: {
			collection: {
				type: "object",
				properties: {
					lat: {type: "number"},
					lng: {type: "number"}
				},
				dependencies: {
					lat: ["lng"],
					lng: ["lat"],
				}
			}
		}
	}
}


export const schema = {
    body: {
		type: "object",
		properties: {
			collection: {
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
					release_date: {
						type: "string",
						format: "date-time"
					},
					country: {type: "string"},
					state: {type: "string"},
					county: {type: "string"},
					lat: {
						type: "number",
						minimum: -90,
						maximum: 90
					},
					lng: {
						type: "number",
						minimum: -180,
						maximum: 180
					},
					latlng_basis: {
						enum: ['','stated in text','based on nearby landmark','based on political unit','estimated from map','unpublished field data']
					},
					max_interval_no: {type: "integer"},
					min_interval_no: {type: "integer"},
					emlperiod_max: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},	
					emlperiod_min: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},
					period_max:	{
						enum: ['Modern','Quaternary','Tertiary','Cretaceous','Jurassic','Triassic','Permian','Carboniferous','Devonian','Silurian','Ordovician','Cambrian','Neoproterozoic']
					},
					period_min:	{
						enum: ['Modern','Quaternary','Tertiary','Cretaceous','Jurassic','Triassic','Permian','Carboniferous','Devonian','Silurian','Ordovician','Cambrian','Neoproterozoic']
					},
					emlepoch_max: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},
					emlepoch_min: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},
					epoch_max:	{type: "string"},	
					epoch_min:	{type: "string"},	
					emlintage_max: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},
					intage_max:	{type: "string"},
					emlintage_min: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},
					intage_min:	{type: "string"},	
					emllocage_max: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},
					locage_max:	{type: "string"},	
					emllocage_min: {
						enum: ['Late/Upper','Middle - Late/Upper','Middle','Early/Lower - Middle','Early/Lower']
					},
					locage_min: {type: "string"},	
					zone_type: {
						enum: ['ammonoid','brachiopod','conodont','foram','graptolite','inoceramid','mammal','nannofossil','pollen','small shelly','trilobite','other']
					},
					zone: {type: "string"},	
					lithology1: {
						enum: ['not reported','"siliciclastic"','claystone','mudstone','"shale"','siltstone','sandstone','gravel','conglomerate','breccia','"mixed carbonate-siliciclastic"','marl','lime mudstone','chalk','travertine','wackestone','packstone','grainstone','"reef rocks"','floatstone','rudstone','bafflestone','bindstone','framestone','"limestone"','dolomite','"carbonate"','calcareous ooze','chert','diatomite','silicious ooze','radiolarite','amber','coal','peat','lignite','subbituminous coal','bituminous coal','anthracite','coal ball','tar','evaporite','gypsum','phosphorite','pyrite','ironstone','siderite','phyllite','slate','schist','quartzite','"volcaniclastic"','ash','tuff'],
						default: "English"
					},
					lithdescript: {type: "string"},	
					lithadj: {
						type: "array",
						items: {
							enum: ['massive','lenticular','tabular','desiccation cracks','current ripples','dunes','hummocky CS','wave ripples','"cross stratification"','wavy/flaser/lenticular bedding','planar lamination','tool marks','flute casts','deformed bedding','grading','burrows','bioturbation','paleosol/pedogenic','condensed','firmground','hardground','lag','very fine','fine','medium','coarse','very coarse','bentonitic','concretionary','diatomaceous','dolomitic','ferruginous','glauconitic','gypsiferous','hematitic','micaceous','nodular','pebbly','phosphatic','pyritic','quartzose','rubbly','sideritic','tuffaceous','stromatolitic','volcaniclastic','flat-pebble','intraclastic','oncoidal','ooidal','peloidal','shelly/skeletal','black','brown','gray','green','red','red or brown','white','yellow','blue','thrombolitic']	
						}
					},
					lithification: {
						enum: ['lithified','poorly lithified','unlithified','metamorphosed']
					},	
					minor_lithology: {
						type: "array",
						items: {
							enum: ['argillaceous','muddy','silty','sandy','conglomeratic','calcareous','cherty/siliceous','carbonaceous']
						}
					},	
					fossilsfrom1: {
						enum: ['Y'] //TODO: This is weird
					},	
					lithadj2: {
						type: "array",
						items: {
							enum: ['massive','lenticular','tabular','desiccation cracks','current ripples','dunes','hummocky CS','wave ripples','"cross stratification"','wavy/flaser/lenticular bedding','planar lamination','tool marks','flute casts','deformed bedding','grading','burrows','bioturbation','paleosol/pedogenic','condensed','firmground','hardground','lag','very fine','fine','medium','coarse','very coarse','bentonitic','concretionary','diatomaceous','dolomitic','ferruginous','glauconitic','gypsiferous','hematitic','micaceous','nodular','pebbly','phosphatic','pyritic','quartzose','rubbly','sideritic','tuffaceous','stromatolitic','volcaniclastic','flat-pebble','intraclastic','oncoidal','ooidal','peloidal','shelly/skeletal','black','brown','gray','green','red','red or brown','white','yellow','blue','thrombolitic']
						}
					},	
					lithification2: {
						enum: ['unlithified','poorly lithified','lithified','metamorphosed']
					},	
					minor_lithology2: {
						type: "array",
						items: {
							enum: ['argillaceous','muddy','silty','sandy','conglomeratic','calcareous','cherty/siliceous','carbonaceous']
						}
					},	
					lithology2: {
						enum: ['"siliciclastic"','claystone','mudstone','"shale"','siltstone','sandstone','gravel','conglomerate','breccia','"mixed carbonate-siliciclastic"','marl','lime mudstone','chalk','travertine','wackestone','packstone','grainstone','"reef rocks"','floatstone','rudstone','bafflestone','bindstone','framestone','"limestone"','dolomite','"carbonate"','calcareous ooze','chert','diatomite','radiolarite','silicious ooze','amber','coal','peat','lignite','subbituminous coal','bituminous coal','anthracite','coal ball','tar','evaporite','gypsum','phosphorite','pyrite','ironstone','siderite','phyllite','slate','schist','quartzite','"volcaniclastic"','ash','tuff']
					},	
					fossilsfrom2: {
						enum: ['Y'] //TODO: still weird
					},	
					environment: {
                        enum: ['marine indet.','terrestrial indet.','carbonate indet.','peritidal','shallow subtidal indet.','open shallow subtidal','lagoonal/restricted shallow subtidal','sand shoal','reef, buildup or bioherm','perireef or subreef','intrashelf/intraplatform reef','platform/shelf-margin reef','slope/ramp reef','basin reef','deep subtidal ramp','deep subtidal shelf','deep subtidal indet.','offshore ramp','offshore shelf','offshore indet.','slope','basinal (carbonate)','basinal (siliceous)','marginal marine indet.','paralic indet.','lagoonal','coastal indet.','foreshore','shoreface','transition zone/lower shoreface','offshore','deltaic indet.','delta plain','interdistributary bay','delta front','prodelta','deep-water indet.','submarine fan','basinal (siliciclastic)','fluvial-lacustrine indet.','fluvial indet.','"channel"','channel lag','coarse channel fill','fine channel fill','"floodplain"','wet floodplain','dry floodplain','levee','crevasse splay','lacustrine indet.','lacustrine - large','lacustrine - small','pond','crater lake','karst indet.','fissure fill','cave','sinkhole','eolian indet.','dune','interdune','loess','fluvial-deltaic indet.','estuary/bay','lacustrine deltaic indet.','lacustrine delta plain','lacustrine interdistributary bay','lacustrine delta front','lacustrine prodelta','alluvial fan','glacial','mire/swamp','spring','tar']
                    },
					tectonic_setting: {
						enum: ['rift','passive margin','back-arc basin','cratonic basin','deep ocean basin','forearc basin','foreland basin','intermontane basin','intramontane basin','piggyback basin','pull-apart basin','volcanic basin','impact basin','non-subsiding area']
					},	
					seq_strat: {
						enum: ['interglacial','glacial','early glacial','high glacial','late glacial','transgressive','regressive','transgressive systems tract','highstand systems tract','lowstand systems tract','parasequence boundary','transgressive surface','maximum flooding surface','sequence boundary']
					},	
					geology_comments: {type: "string"},	
					pres_mode: {
						type: "array",
						items: {
							enum: ['body','cast','mold/impression','adpression','trace','concretion','soft parts','recrystallized','permineralized','dissolution traces','charcoalification','coalified','original aragonite','original calcite','original phosphate','original silica','original chitin','original carbon','original sporopollenin','original cellulose','replaced with calcite','replaced with dolomite','replaced with silica','replaced with pyrite','replaced with siderite','replaced with hematite','replaced with limonite','replaced with phosphate','replaced with carbon','replaced with other','amber','anthropogenic','bone collector','coquina','coprolite','midden','shellbed']
						}
					},
					temporal_resolution: {
						enum: ['snapshot','time-averaged','condensed']
					},	
					spatial_resolution:	{
						enum: ['autochthonous','parautochthonous','allochthonous']
					},	
					lagerstatten: {
						enum: ['conservation','concentrate']
					},	
					concentration: {
						enum: ['dispersed','','concentrated','-single event','-multiple events','-seasonal','-lag','-hiatal','-bonebed']
					},
					orientation: {
						enum: ['life position','random','preferred']
					},	
					preservation_quality: {
						enum: ['excellent','good','medium','poor','very poor','variable']
					},
					abund_in_sediment: {
						enum: ['abundant','common','few','rare']
					},	
					sorting: {
						enum: ['very poor','poor','medium','well','very well']
					},	
					fragmentation: {
						enum: ['none','occasional','frequent','extreme']
					},
					bioerosion: {
						enum: ['none','occasional','frequent','extreme']
					},	
					encrustation: {
						enum: ['none','occasional','frequent','extreme']
					},	
					preservation_comments: {
						type: "string"
					},	
					assembl_comps: {
						type: "array",
						items: {
							enum: ['macrofossils','mesofossils','microfossils']
						}
					},	
					articulated_parts: {
						enum: ['none','some','many']
					},	
					associated_parts: {
						enum: ['none','some','many']
					},	
					disassoc_minor_elems: {
						enum: ['none','some','many','all']
					},	
					disassoc_maj_elems: {
						enum: ['none','some','many','all']
					},
					art_whole_bodies: {
						enum: ['none','some','many','all']
					},	
					disart_assoc_maj_elems: {
						enum: ['none','some','many','all']
					},	
					common_body_parts: {
						type: "array",
						items: {
							enum: ['','other','skeletons','partial skeletons','skulls','partial skulls','maxillae','mandibles','teeth','otoliths','postcrania','vertebrae','limb elements','osteoderms','dermal scales','footprints','eggs','shells','partial shells','tests','valves','exoskeletons','cephalons/heads','thoraces','cephalothoraces','carapaces','abdomens','pygidia','claws','appendages','wings','forewings','hindwings','tegmina','elytra','nymphs','calyces','stems','stem ossicles','leaves','seeds','fruit','axes','plant debris','marine palyn','microspores','megaspores','flowers','seed repro','non-seed repro','wood','sterile axes','fertile axes','roots','cuticles','multi organs']
						}
					},
					rare_body_parts: {
						type: "array",
						items: {
							enum: ['','other','skeletons','partial skeletons','skulls','partial skulls','maxillae','mandibles','teeth','otoliths','postcrania','vertebrae','limb elements','osteoderms','dermal scales','footprints','eggs','shells','partial shells','tests','valves','exoskeletons','cephalons/heads','thoraces','cephalothoraces','carapaces','abdomens','pygidia','claws','appendages','wings','forewings','hindwings','tegmina','elytra','nymphs','calyces','stems','stem ossicles','leaves','seeds','fruit','axes','plant debris','marine palyn','microspores','megaspores','flowers','seed repro','non-seed repro','wood','sterile axes','fertile axes','roots','cuticles','multi organs']
						}
					},
					feed_pred_traces: {
						type: "array",
						items: {
							enum: ['drill holes','repair scars','fractures','punctures','tooth marks','gastric dissolution','burning','cutmarks','stone tools','external foliage feeding','arthropod mining','arthropod galling','arthropod boring','seed feeding','piercing/sucking','palynivory','oviposition']
						}
					},
					artifacts: {
						type: "array",
						items: {
							enum: ['stone points','stone tools','debitage','cutmarks','bone tools','burned bone','charcoal/hearths','metal tools','ceramics','textiles','structural remains','historical artifacts']
						}
					},	
					component_comments: {
						type: "string"
					},
					collection_coverage: {
						type: "array",
						items: {
							enum: ['all macrofossils','all microfossils','some genera','some macrofossils','some microfossils','species names','difficult macrofossils','ichnofossils']
						}
					},	
					coll_meth: {
						type: "array",
						items: {
							enum: ['bulk','core','salvage','selective quarrying','surface (float)','surface (in situ)','anthill','chemical','mechanical','peel or thin section','smear slide','acetic','hydrochloric','hydroflouric','peroxide','sieve','field collection','survey of museum collection','private collection','observed (not collected)','repository not specified']
						}
					},	
					sieve_size_min: {
						type: "number"
					},	
					sieve_size_max: {
						type: "number"
					},
					collection_size: {
						type: "integer"
					},	
					collection_size_unit: {
						enum: ['specimens','individuals']
					},	
					rock_censused: {
						type: "integer"
					},	
					rock_censused_unit: {
						enum: ['cm (line intercept)','cm2 (area)','cm3 (volume)','g','kg','# of surfaces (quadrat)']
					},
					museum: {
						type: "array",
						items: {
							enum: ['AMNH','AMPG','ANSP','BAS','BGS','BMNH','BPI','BSP','CAS','CIT','CM','DMNH','FLMNH','FMNH','GSC','GSI','IGNS','IVAU','IVPP','LACM','MACN','MCZ','MEF','MfN','MLP','MNHN','MNHN (La Paz)','NHMW','NIGPAS','NMB','NMC','NMMNH','NYSM','OSU','OU','OUM','PIN','PRI','ROM','SDSM','SGOPV','SM','SMF','SMNS','SUI','TMM','TMP','UCM','UCMP','UMMP','UNM','UNSM','UQ','USGS','USNM','UW','UWBM','WAM','YPM']
						}
					},
					collectors: {
						type: "string"
					},	
					collection_dates: {
						type: "string"
					},	
					collection_comments: {
						type: "string"
					},	
					taxonomy_comments: {
						type: "string"
					},	
					source_database: {
						enum: ['ETE','Fossilworks','PaleoDB','PGAP']
					},
					research_group: {
						type: "array",
						items: {
							enum: ['decapod','ETE','freshwater','GCP','marine invertebrate','micropaleontology','mid-Pz','PACED','paleobotany','paleoentomology','taphonomy','vertebrate','eODP']
						}
					},	
					license: {
						type: "array",
						items: {
							enum: ['','CC BY']
						}
					},	
					collection_subset: {
						type: "integer"
					},
					collection_aka: {
						type: "string"
					},
					paleolng: {	
						type: "number"
					},
					paleolat: {	
						type: "number"
					},	
					plate: {	
						type: "integer"
					},	
					altitude_value: {
						type: "integer"
					},	
					altitude_unit: {
						enum: ['meters','feet']
					},	
					geogscale: {
						enum: ['hand sample','small collection','outcrop','local area','basin']
					},	
					geogcomments: {
						type: "string"
					},		
					formation: {
						type: "string"
					},			
					geological_group: {
						type: "string"
					},			
					member: {
						type: "string"
					},				
					localsection: {
						type: "string"
					},				
					localbed: {
						type: "string"
					},				
					localbedunit: {
						enum: ['m','cm','ft','mbsf']
					},	
					localorder: {
						enum: ['bottom to top','top to bottom','no particular order']
					},	
					regionalsection: {
						type: "string"
					},				
					regionalbed: {
						type: "string"
					},				
					regionalbedunit: {
						enum: ['m','cm','ft','mbsf']	
					},
					regionalorder: {
						enum: ['bottom to top','top to bottom','no particular order']
					},	
					stratscale: {
						enum: ['bed','group of beds','member','formation','group']
					},	
					stratcomments: {
						type: "string"
					},				
				},
				required: [
                    "reference_no",
                    "access_level",
                    "release_date",
                    "collection_name",
                    "collection_type",
                    "country",
                    //"state",
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