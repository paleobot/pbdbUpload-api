/*
Validation schemas in JSON Schema format. Note that fastify uses ajv (https://ajv.js.org/) for validation, which expects the schemas to be javascript objects rather than raw JSON. Consequently, property names (keys) do not require double quotes.
*/

const authorityProperties = {
	taxon_no: {type: "integer"},
	orig_no: {type: "integer"},	
	reference_no: {type: "integer"},	
	taxon_rank: {
		type: "string",
		enum: ['','subspecies','species','subgenus','genus','subtribe','tribe','subfamily','family','superfamily','infraorder','suborder','order','superorder','infraclass','subclass','class','superclass','subphylum','phylum','superphylum','subkingdom','kingdom','superkingdom','unranked clade','informal']
	},	
	taxon_name: {
		type: "string",
		maxLength: 80
	},	
	common_name: {
		type: "string",
		maxLength: 80
	},	
	type_taxon_no: {type: "integer"},	
	type_specimen: {
		type: "string",
		maxLength: 255
	},	
	museum: {
		type: "string",
		maxLength: 12
	},	
	catalog_number: {
		type: "string",
		maxLength: 80
	},	
	type_body_part: {
		type: "string",
		enum: ['','other','skeleton','partial skeleton','skull','partial skull','maxilla','mandible','teeth','tooth','otolith','postcrania','vertebrae','limb elements','limb element','osteoderm','dermal scale','footprint','egg','shell','partial shell','test','valve','exoskeleton','cephalon/head','thorax','cephalothorax','carapace','abdomen','pygidium','claw','appendages','wing','forewing','hindwing','tegmen','elytra','nymph','calyx','stem','stem ossicles','leaf','seed/fruit','axis','plant debris','marine palyn','microspore','megaspore','flower','seed repro','non-seed repro','wood','sterile axis','fertile axis','root','cuticle','multi organs']	
	},
	form_taxon: {
		type: "string",
		enum: ['','no','yes']	
	},
	part_details: {
		type: "string",
		maxLength: 160
	},
	type_locality: {type: "integer"},	
	extant_old: {
		type: "string",
		maxLength: 4
	},	
	extant: {
		type: "string",
		enum: ['','no','yes']	
	},
	first_occurrence: {
		type: "string",
		maxLength: 255
	},
	last_occurrence: {
		type: "string",
		maxLength: 255
	},
	preservation_old: {
		type: "string",
		enum: ['','regular taxon','ichnotaxon','other parataxon']
	},	
	preservation_less_old: {
		type: "string",
		enum: ['','regular taxon','form taxon','ichnofossil']
	},
	preservation: {
		type: "string",
		enum: ['','body (3D)','compression','soft parts (2D)','soft parts (3D)','amber','cast','mold','impression','trace','not a trace']
	},	
	ref_is_authority: {
		type: "string",
		maxLength: 4
	},	
	refauth: {type: "integer"},	
	author1init: {
		type: "string",
		maxLength: 10
	},	
	author1last: {
		type: "string",
		maxLength: 80
	},	
	author2init: {
		type: "string",
		maxLength: 10
	},	
	author2last: {
		type: "string",
		maxLength: 80
	},	
	otherauthors: {
		type: "string",
		maxLength: 255
	},	
	pubyr: {
		type: "string",
		maxLength: 4
	},	
	pages: {
		type: "string",
		maxLength: 40
	},	
	figures: {
		type: "string",
		maxLength: 100
	},
	comments: {
		type: "string",
	},	
	discussion: {
		type: "string",
	},	
	discussed_by: {type: "integer"},	
	upload: {
		type: "string",
		enum: ['','YES']
	},	
}

export const getSchema = {
	tags:["Authority"],
	hide: true,
	response: {
		501: {
			description: 'Not implemented',
			type: 'object',
			properties: {
				statusCode: {type: "integer"},
				msg: {type: "string"} 
			}
		  },	
	}

}

export const editSchema = {
	tags:["Authority"],
    body: {
		type: "object",
		properties: {
			authority: {
				type: "object",
				properties: authorityProperties,
			},
			allowDuplicate: {
				type: "boolean"
			}
		},
		examples: [{
			authority: {
				plant_organ: "leaf"
			}		
		}],
	},
	response: {
		204: {
			description: 'Authority modified',
			type: 'object',
			properties: {
				statusCode: {type: "integer"},
				msg: {type: "string"},
			}
		  },	
	}
}

export const createSchema = {
	tags:["Authority"],
    body: {
		type: "object",
		properties: {
			authority: {
				type: "object",
				properties: authorityProperties,
				additionalProperties: false,
				required: [
					"collection_no",
					"taxon_no",
					"reference_no",
                ],
				dependentRequired: {
					abund_value: ["abund_unit"]
				  }
				
			},
			allowDuplicate: {
				type: "boolean"
			}
      	},
		examples: [{
			authority:{
			}
		}],
	},
	response: {
		201: {
			description: "Authority created",
			type: "object",
			properties: {
				statusCode: {type: "integer"},
				msg: {type: "string"},
			  	taxon_no: {type: "integer"}
			}
		},
		400: {
			description: "Bad request",
			type: "object",
			properties: {
				statusCode: {type: "integer"},
				msg: {type: "string"},
			}
		}	
	}
}