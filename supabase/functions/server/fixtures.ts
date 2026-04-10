function createUserFixture(name, email) {
    return {
        id: Math.random().toString(36).substring(2, 15),
        name: name,
        email: email,
        created_at: new Date().toISOString()
    };
}

function createCourtFixture(name, location) {
    return {
        id: Math.random().toString(36).substring(2, 15),
        name: name,
        location: location,
        created_at: new Date().toISOString()
    };
}

function createPlanFixture(name, price) {
    return {
        id: Math.random().toString(36).substring(2, 15),
        name: name,
        price: price,
        created_at: new Date().toISOString()
    };
}

export { createUserFixture, createCourtFixture, createPlanFixture };